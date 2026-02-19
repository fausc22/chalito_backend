require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');


const port = process.env.PORT;
const app = express();

// Crear servidor HTTP para Socket.IO
const server = http.createServer(app);

// Configurar Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'development' 
            ? ['http://localhost:3000', /^http:\/\/localhost:\d+$/]
            : process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Estado global de sincronización del worker
const workerState = {
    active: false,
    lastHeartbeat: null
};

const WORKER_HEARTBEAT_INTERVAL_MS = 10000;
let workerHeartbeatInterval = null;

function emitWorkerStatus(ioInstance, active = true) {
    workerState.active = Boolean(active);
    workerState.lastHeartbeat = Date.now();

    ioInstance.emit('worker_status', {
        active: workerState.active,
        timestamp: workerState.lastHeartbeat
    });

    console.log('Worker status emitido:', workerState.active ? 'ACTIVE' : 'INACTIVE');
}

function emitWorkerHeartbeat(ioInstance) {
    workerState.lastHeartbeat = Date.now();

    ioInstance.emit('worker_heartbeat', {
        active: workerState.active,
        timestamp: workerState.lastHeartbeat
    });
}

function emitWorkerStatusToSocket(socket) {
    socket.emit('worker_status', {
        active: workerState.active,
        timestamp: workerState.lastHeartbeat
    });
}

function ensureWorkerHeartbeatInterval(ioInstance) {
    if (workerHeartbeatInterval) return;

    workerHeartbeatInterval = setInterval(() => {
        if (workerState.active) {
            emitWorkerHeartbeat(ioInstance);
        }
    }, WORKER_HEARTBEAT_INTERVAL_MS);
}

// Inicializar servicio de sockets
const { getInstance: getSocketService } = require('./services/SocketService');
const socketService = getSocketService(io);

const authRoutes = require('./routes/authRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const articulosRoutes = require('./routes/articulosRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const ventasRoutes = require('./routes/ventasRoutes');
const comandasRoutes = require('./routes/comandasRoutes');
const configuracionRoutes = require('./routes/configuracionRoutes');
const healthRoutes = require('./routes/healthRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const fondosRoutes = require('./routes/fondosRoutes');
const gastosRoutes = require('./routes/gastosRoutes');

// Importar worker de cola de pedidos
const OrderQueueWorker = require('./workers/OrderQueueWorker');

// Envolver start/stop para sincronizar estado sin tocar la lógica del worker
const originalWorkerStart = OrderQueueWorker.start.bind(OrderQueueWorker);
OrderQueueWorker.start = async (...args) => {
    try {
        const result = await originalWorkerStart(...args);
        emitWorkerStatus(io, true);
        return result;
    } catch (error) {
        emitWorkerStatus(io, false);
        throw error;
    }
};

const originalWorkerStop = OrderQueueWorker.stop.bind(OrderQueueWorker);
OrderQueueWorker.stop = (...args) => {
    const result = originalWorkerStop(...args);
    emitWorkerStatus(io, false);
    return result;
};

// Inicializar sincronización al boot sin duplicar intervals
ensureWorkerHeartbeatInterval(io);
emitWorkerStatus(io, Boolean(OrderQueueWorker.isRunning));


// CORS configuration - Optimizado para VPS
const allowedOrigins = [
    'http://localhost:3000', 
    
    
];

// En desarrollo, permitir cualquier origen localhost
if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push(/^http:\/\/localhost:\d+$/);    
    allowedOrigins.push(/^http:\/\/127\.0\.0\.1:\d+$/);
}


const corsOptions = {
    origin: (origin, callback) => {
        // Permitir requests sin origen (apps móviles, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Verificar si el origen está en la lista permitida
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return allowedOrigin === origin;
            }
            // Para RegExp
            return allowedOrigin.test(origin);
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log(`❌ CORS bloqueado para origen: ${origin}`);
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // Para navegadores legacy
};


const { middlewareAuditoria } = require('./middlewares/auditoriaMiddleware');

app.use(cors(corsOptions));
app.use(cookieParser());  
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


//ENDPOINT DE SALUD
app.get('/health', async (req, res) => {
    try {
        // Test básico de conexión a BD
        const db = require('./controllers/dbPromise');
        const startTime = Date.now();
        await db.execute('SELECT 1');
        const dbResponseTime = Date.now() - startTime;
        
        
        
        res.json({
            status: '✅ VPS Healthy',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            server: {
                platform: 'VPS Hostinger',
                uptime: Math.floor(process.uptime()),
                memory: process.memoryUsage(),
                port: port,
                version: '1.0.0'
            },
            database: {
                status: '✅ Connected',
                responseTime: `${dbResponseTime}ms`
            },
            
        });
    } catch (error) {
        res.status(500).json({
            status: '❌ VPS Error',
            timestamp: new Date().toISOString(),
            server: {
                platform: 'VPS Hostinger',
                uptime: Math.floor(process.uptime()),
                memory: process.memoryUsage()
            },
            database: '❌ Disconnected',
            error: error.message
        });
    }
});


app.use('/auth', authRoutes);
app.use('/auditoria', auditoriaRoutes);
app.use('/articulos', articulosRoutes);
app.use('/inventario', inventarioRoutes);
app.use('/pedidos', pedidosRoutes);
app.use('/ventas', ventasRoutes);
app.use('/comandas', comandasRoutes);
app.use('/configuracion-sistema', configuracionRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes);
app.use('/fondos', fondosRoutes);
app.use('/gastos', gastosRoutes);

// Middleware global de manejo de errores
app.use((error, req, res, next) => {
    console.error('💥 Error global en VPS:', error);
    
    res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Error interno del servidor' 
            : error.message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        server: 'VPS Hostinger'
    });
});


// Configurar Socket.IO connections
io.on('connection', (socket) => {
    console.log(`🔌 [Socket.IO] Cliente conectado: ${socket.id}`);
    socketService.registrarCliente(socket.id);

    // Enviar snapshot inmediato del estado del worker al conectar
    emitWorkerStatusToSocket(socket);
    socket.emit('worker_connected', {
        active: workerState.active,
        timestamp: workerState.lastHeartbeat
    });

    socket.on('disconnect', () => {
        console.log(`🔌 [Socket.IO] Cliente desconectado: ${socket.id}`);
        socketService.desregistrarCliente(socket.id);
    });

    // Compatibilidad con requests de estado desde frontend
    socket.on('worker_status:request', () => {
        emitWorkerStatusToSocket(socket);
    });

    socket.on('worker:status:request', () => {
        emitWorkerStatusToSocket(socket);
    });

    socket.on('subscribe:worker-status', () => {
        emitWorkerStatusToSocket(socket);
    });

    // Opcional: Suscripción a eventos específicos
    socket.on('subscribe:pedidos', () => {
        socket.join('pedidos-room');
        console.log(`👂 [Socket.IO] Cliente ${socket.id} suscrito a pedidos`);
    });

    socket.on('subscribe:capacidad', () => {
        socket.join('capacidad-room');
        console.log(`👂 [Socket.IO] Cliente ${socket.id} suscrito a capacidad`);
    });
});

// Usar server.listen en lugar de app.listen
server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado`);
    console.log(`🌍 Puerto: ${port}`);
    console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 URL local: http://localhost:${port}`);
    console.log(`💾 Memoria inicial: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`⏰ Iniciado: ${new Date().toLocaleString()}`);
    
    // Log de configuración importante para VPS
    console.log(`📋 Configuración VPS:`);
    console.log(`   - Node.js: ${process.version}`);
    console.log(`   - Plataforma: ${process.platform}`);
    console.log(`   - Arquitectura: ${process.arch}`);
    console.log(`   - PID: ${process.pid}`);
    
    // Iniciar worker de cola de pedidos (con delay para asegurar que BD esté lista)
    setTimeout(async () => {
        try {
            await OrderQueueWorker.start(null, io); // Pasar io para eventos WebSocket
        } catch (error) {
            console.error('❌ Error iniciando OrderQueueWorker:', error);
        }
    }, 3000); // Esperar 3 segundos después del inicio del servidor
});

// Exportar io para usar en otros módulos
app.set('io', io);

// Manejar cierre graceful del servidor
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM recibido, cerrando servidor gracefully...');
    OrderQueueWorker.stop();
    if (workerHeartbeatInterval) {
        clearInterval(workerHeartbeatInterval);
        workerHeartbeatInterval = null;
    }
    io.close(() => {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT recibido, cerrando servidor gracefully...');
    OrderQueueWorker.stop();
    if (workerHeartbeatInterval) {
        clearInterval(workerHeartbeatInterval);
        workerHeartbeatInterval = null;
    }
    io.close(() => {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    });
});