require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');


const port = process.env.PORT;
const app = express();

const authRoutes = require('./routes/authRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');


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


// Aca lo hago sin destructuring porque exportan solo el router sino no me dejaba
const inventarioRoutes = require('./routes/inventarioRoutes');
app.use('/inventario', inventarioRoutes);


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


const server = app.listen(port, '0.0.0.0', () => {
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
});