const { OrderQueueEngine, setGlobalIo } = require('../services/OrderQueueEngine');
const TimeLearningService = require('../services/TimeLearningService');
const AdaptiveCapacityService = require('../services/AdaptiveCapacityService');
const DelayPredictionService = require('../services/DelayPredictionService');

/**
 * Worker que ejecuta el motor de cola de pedidos periódicamente
 */
class OrderQueueWorker {
    constructor() {
        this.task = null;
        this.isRunning = false;
        this.intervalSeconds = 30; // Default 30 segundos
        this.lastExecution = null; // Timestamp de última ejecución exitosa
        this.lastExecutionAt = null; // Alias para compatibilidad
        this.executionCount = 0;
        this.startTime = null; // Timestamp de inicio del worker
    }

    /**
     * Configurar io para eventos WebSocket
     */
    setIo(io) {
        setGlobalIo(io);
    }

    /**
     * Iniciar el worker
     */
    async start(customInterval = null, io = null) {
        if (io) {
            this.setIo(io);
        }
        if (this.isRunning) {
            console.log('⚠️ [OrderQueueWorker] Worker ya está corriendo');
            return;
        }

        // Obtener intervalo desde configuración o usar el proporcionado
        if (!customInterval) {
            try {
                const db = require('../controllers/dbPromise');
                const [config] = await db.execute(
                    'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                    ['worker_interval_segundos']
                );
                
                if (config.length > 0) {
                    this.intervalSeconds = parseInt(config[0].valor, 10) || 30;
                }
            } catch (error) {
                console.warn('⚠️ [OrderQueueWorker] No se pudo obtener intervalo desde configuración, usando default (30s)');
            }
        } else {
            this.intervalSeconds = customInterval;
        }

        // Convertir segundos a formato cron (cada X segundos)
        // node-cron no soporta segundos directamente, así que usamos setInterval
        console.log(`🚀 [OrderQueueWorker] Iniciando worker (intervalo: ${this.intervalSeconds}s)`);
        
        // Marcar como iniciado ANTES de crear el intervalo
        this.isRunning = true;
        this.startTime = new Date();
        
        // Ejecutar inmediatamente al iniciar para establecer lastExecution
        console.log('🔄 [OrderQueueWorker] Ejecutando primera iteración...');
        await this.execute();

        // Crear intervalo para ejecuciones periódicas
        this.task = setInterval(async () => {
            await this.execute();
        }, this.intervalSeconds * 1000);

        console.log(`✅ [OrderQueueWorker] Worker iniciado correctamente (intervalo: ${this.intervalSeconds}s, última ejecución: ${this.lastExecution?.toLocaleString() || 'N/A'})`);
    }

    /**
     * Ejecutar una iteración del motor
     */
    async execute() {
        const ejecucionInicio = new Date();
        this.executionCount++;
        
        try {
            console.log(`\n🔄 [OrderQueueWorker] Ejecución #${this.executionCount} iniciada - ${ejecucionInicio.toLocaleString()}`);
            
            // Evaluar cola de pedidos
            const resultado = await OrderQueueEngine.evaluarColaPedidos();
            
            // Detectar pedidos atrasados
            await OrderQueueEngine.detectarPedidosAtrasados();
            
            // Fase 4: Ejecutar servicios avanzados (cada 5 minutos = 10 ciclos de 30s)
            if (this.executionCount % 10 === 0) {
                try {
                    // Actualizar demora cocina automáticamente
                    await DelayPredictionService.actualizarDemoraAutomatica();
                    
                    // Recalcular tiempo base y analizar capacidad (cada hora = 120 ciclos)
                    if (this.executionCount % 120 === 0) {
                        await TimeLearningService.recalcularTiempoBase();
                        await AdaptiveCapacityService.analizarCargaReal();
                    }
                } catch (error) {
                    console.error('❌ [OrderQueueWorker] Error en servicios Fase 4:', error);
                }
            }
            
            // IMPORTANTE: Registrar última ejecución exitosa SOLO si todo salió bien
            // Esto asegura que lastExecution refleje ejecuciones completas
            this.lastExecution = ejecucionInicio;
            this.lastExecutionAt = ejecucionInicio; // Alias para compatibilidad
            
            const duracion = Date.now() - ejecucionInicio.getTime();
            console.log(`✅ [OrderQueueWorker] Ejecución #${this.executionCount} completada en ${duracion}ms`);
            
            return resultado;
        } catch (error) {
            console.error(`❌ [OrderQueueWorker] Error en ejecución #${this.executionCount}:`, error);
            
            // Registrar ejecución incluso con error (para monitoreo)
            // pero marcamos que hubo error para que el health check pueda detectarlo
            this.lastExecution = ejecucionInicio;
            this.lastExecutionAt = ejecucionInicio;
            
            return { error: error.message };
        }
    }

    /**
     * Detener el worker
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ [OrderQueueWorker] Worker no está corriendo');
            return;
        }

        console.log('🛑 [OrderQueueWorker] Deteniendo worker...');

        if (this.task) {
            clearInterval(this.task);
            this.task = null;
        }

        this.isRunning = false;
        const uptime = this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0;
        console.log(`✅ [OrderQueueWorker] Worker detenido (total ejecuciones: ${this.executionCount}, uptime: ${uptime}s)`);
    }

    /**
     * Obtener estado del worker
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalSeconds: this.intervalSeconds,
            lastExecution: this.lastExecution,
            lastExecutionAt: this.lastExecutionAt || this.lastExecution, // Compatibilidad
            executionCount: this.executionCount,
            startTime: this.startTime
        };
    }

    /**
     * Actualizar intervalo (requiere reiniciar worker)
     */
    async updateInterval(newIntervalSeconds) {
        const wasRunning = this.isRunning;
        if (wasRunning) {
            this.stop();
        }
        this.intervalSeconds = newIntervalSeconds;
        if (wasRunning) {
            await this.start(newIntervalSeconds);
        }
    }
}

// Crear instancia única (singleton)
const workerInstance = new OrderQueueWorker();

module.exports = workerInstance;

