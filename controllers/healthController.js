/**
 * Controller para endpoints de health check
 * 
 * @module controllers/healthController
 */

const OrderQueueWorker = require('../workers/OrderQueueWorker');

/**
 * Health check del worker de cola de pedidos
 * GET /health/worker
 * 
 * Lógica de estado:
 * - STOPPED: isRunning === false
 * - WARNING: isRunning === true pero no hay ejecuciones recientes (más de intervalo * 2)
 * - OK: isRunning === true y última ejecución fue reciente (menos de intervalo * 2)
 */
const obtenerEstadoWorker = async (req, res) => {
    try {
        const status = OrderQueueWorker.getStatus();
        const ahora = new Date();
        
        // Calcular tiempo desde última ejecución
        let tiempoDesdeUltimaEjecucion = null;
        const lastExecutionTimestamp = status.lastExecutionAt || status.lastExecution;
        
        if (lastExecutionTimestamp) {
            const diffMs = ahora - new Date(lastExecutionTimestamp);
            const diffSegundos = Math.floor(diffMs / 1000);
            tiempoDesdeUltimaEjecucion = diffSegundos;
        }
        
        // Determinar estado del worker con lógica mejorada
        let estadoWorker = 'OK';
        
        if (!status.isRunning) {
            // Worker está detenido
            estadoWorker = 'STOPPED';
        } else if (!lastExecutionTimestamp) {
            // Worker está corriendo pero nunca ejecutó (recién iniciado, esperando primera ejecución)
            // Si pasaron más de 2 intervalos desde el inicio y aún no hay ejecución, algo está mal
            if (status.startTime) {
                const tiempoDesdeInicio = Math.floor((ahora - new Date(status.startTime).getTime()) / 1000);
                if (tiempoDesdeInicio > status.intervalSeconds * 2) {
                    estadoWorker = 'WARNING';
                } else {
                    // Recién iniciado, esperar primera ejecución
                    estadoWorker = 'OK';
                }
            } else {
                estadoWorker = 'WARNING';
            }
        } else {
            // Worker está corriendo y tiene ejecuciones
            // Considerar activo si la última ejecución fue hace menos de intervalo * 2
            const umbralSegundos = status.intervalSeconds * 2;
            if (tiempoDesdeUltimaEjecucion > umbralSegundos) {
                // Pasó más del doble del intervalo, algo puede estar mal
                estadoWorker = 'WARNING';
            } else {
                // Todo normal, última ejecución reciente
                estadoWorker = 'OK';
            }
        }
        
        res.json({
            running: status.isRunning,
            lastExecution: lastExecutionTimestamp ? new Date(lastExecutionTimestamp).toISOString() : null,
            lastExecutionAt: lastExecutionTimestamp ? new Date(lastExecutionTimestamp).toISOString() : null,
            intervalSeconds: status.intervalSeconds,
            executionCount: status.executionCount,
            tiempoDesdeUltimaEjecucion: tiempoDesdeUltimaEjecucion,
            startTime: status.startTime ? new Date(status.startTime).toISOString() : null,
            status: estadoWorker,
            // Información adicional para debugging
            _debug: {
                umbralSegundos: status.intervalSeconds * 2,
                tiempoDesdeInicio: status.startTime ? Math.floor((ahora - new Date(status.startTime).getTime()) / 1000) : null
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo estado del worker:', error);
        res.status(500).json({
            running: false,
            status: 'ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    obtenerEstadoWorker
};

