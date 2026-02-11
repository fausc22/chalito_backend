/**
 * Controller para métricas del sistema
 * 
 * @module controllers/metricsController
 */

const db = require('./dbPromise');
const TimeCalculationService = require('../services/TimeCalculationService');

/**
 * Obtener métricas de pedidos atrasados
 * GET /metrics/pedidos-atrasados
 */
const obtenerMetricasPedidosAtrasados = async (req, res) => {
    try {
        const ahora = new Date();
        
        // Obtener pedidos atrasados con información completa
        const [pedidosAtrasados] = await db.execute(
            `SELECT 
                id, 
                hora_esperada_finalizacion, 
                hora_inicio_preparacion,
                cliente_nombre,
                modalidad
             FROM pedidos 
             WHERE estado = 'EN_PREPARACION' 
               AND hora_esperada_finalizacion IS NOT NULL
               AND hora_esperada_finalizacion < ?
               AND DATE(fecha) = CURDATE()
             ORDER BY hora_esperada_finalizacion ASC`,
            [ahora]
        );
        
        // Calcular métricas
        let cantidadAtrasados = pedidosAtrasados.length;
        let tiempoPromedioAtraso = null;
        let pedidoMayorAtraso = null;
        let tiempoMayorAtraso = 0;
        
        if (pedidosAtrasados.length > 0) {
            // Calcular tiempo promedio de atraso
            let totalMinutosAtraso = 0;
            
            for (const pedido of pedidosAtrasados) {
                const horaEsperada = new Date(pedido.hora_esperada_finalizacion);
                const minutosAtraso = Math.floor((ahora - horaEsperada) / (1000 * 60));
                totalMinutosAtraso += minutosAtraso;
                
                // Buscar el pedido con mayor atraso
                if (minutosAtraso > tiempoMayorAtraso) {
                    tiempoMayorAtraso = minutosAtraso;
                    pedidoMayorAtraso = {
                        id: pedido.id,
                        cliente_nombre: pedido.cliente_nombre,
                        modalidad: pedido.modalidad,
                        minutos_atraso: minutosAtraso,
                        hora_esperada: pedido.hora_esperada_finalizacion
                    };
                }
            }
            
            tiempoPromedioAtraso = Math.round(totalMinutosAtraso / pedidosAtrasados.length);
        }
        
        res.json({
            success: true,
            timestamp: ahora.toISOString(),
            metrics: {
                cantidad_atrasados: cantidadAtrasados,
                tiempo_promedio_atraso_minutos: tiempoPromedioAtraso,
                pedido_mayor_atraso: pedidoMayorAtraso,
                pedidos: pedidosAtrasados.map(p => ({
                    id: p.id,
                    cliente_nombre: p.cliente_nombre,
                    modalidad: p.modalidad,
                    minutos_atraso: Math.floor((ahora - new Date(p.hora_esperada_finalizacion)) / (1000 * 60)),
                    hora_esperada: p.hora_esperada_finalizacion
                }))
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo métricas de pedidos atrasados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener métricas de pedidos atrasados',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    obtenerMetricasPedidosAtrasados
};




