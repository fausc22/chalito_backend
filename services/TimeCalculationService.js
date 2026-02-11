const db = require('../controllers/dbPromise');

/**
 * Servicio para cálculos de tiempo relacionados con pedidos
 */
class TimeCalculationService {
    /**
     * Obtener tiempo estimado de preparación (por defecto o del pedido)
     */
    static async obtenerTiempoEstimado(pedidoId = null) {
        try {
            // Si se proporciona pedidoId, intentar obtener su tiempo específico
            if (pedidoId) {
                const [pedidos] = await db.execute(
                    'SELECT tiempo_estimado_preparacion FROM pedidos WHERE id = ?',
                    [pedidoId]
                );
                
                if (pedidos.length > 0 && pedidos[0].tiempo_estimado_preparacion) {
                    return pedidos[0].tiempo_estimado_preparacion;
                }
            }
            
            // Si no, obtener tiempo base desde configuración
            const [config] = await db.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                ['tiempo_base_preparacion_minutos']
            );
            
            if (config.length > 0) {
                return parseInt(config[0].valor, 10) || 15;
            }
            return 15; // Default
        } catch (error) {
            console.error('Error obteniendo tiempo estimado:', error);
            return 15; // Default en caso de error
        }
    }

    /**
     * Calcular hora_inicio_preparacion para pedido programado
     * hora_inicio_preparacion = horario_entrega - tiempo_estimado
     */
    static calcularHoraInicioPreparacion(horarioEntrega, tiempoEstimadoMinutos) {
        if (!horarioEntrega) return null;
        
        const horarioEntregaDate = new Date(horarioEntrega);
        const tiempoEstimadoMs = tiempoEstimadoMinutos * 60 * 1000;
        const horaInicio = new Date(horarioEntregaDate.getTime() - tiempoEstimadoMs);
        
        return horaInicio;
    }

    /**
     * Calcular hora_esperada_finalizacion
     * hora_esperada_finalizacion = hora_inicio_preparacion + tiempo_estimado
     */
    static calcularHoraEsperadaFinalizacion(horaInicioPreparacion, tiempoEstimadoMinutos) {
        if (!horaInicioPreparacion) return null;
        
        const horaInicioDate = new Date(horaInicioPreparacion);
        const tiempoEstimadoMs = tiempoEstimadoMinutos * 60 * 1000;
        const horaFinalizacion = new Date(horaInicioDate.getTime() + tiempoEstimadoMs);
        
        return horaFinalizacion;
    }

    /**
     * Verificar si un pedido programado ya debe empezar a prepararse
     */
    static async verificarSiDebeIniciarPreparacion(pedidoId) {
        try {
            const [pedidos] = await db.execute(
                'SELECT horario_entrega, tiempo_estimado_preparacion FROM pedidos WHERE id = ?',
                [pedidoId]
            );
            
            if (pedidos.length === 0) return false;
            
            const pedido = pedidos[0];
            
            // Si no tiene horario_entrega, es pedido "cuanto antes" -> puede iniciar
            if (!pedido.horario_entrega) return true;
            
            // Calcular hora_inicio_preparacion
            const tiempoEstimado = pedido.tiempo_estimado_preparacion || await this.obtenerTiempoEstimado();
            const horaInicioPreparacion = this.calcularHoraInicioPreparacion(
                pedido.horario_entrega,
                tiempoEstimado
            );
            
            // Verificar si ya es hora
            const ahora = new Date();
            return ahora >= horaInicioPreparacion;
        } catch (error) {
            console.error('Error verificando si debe iniciar preparación:', error);
            return false; // Por seguridad, no iniciar si hay error
        }
    }

    /**
     * Detectar pedidos que deberían estar listos (atrasados) - solo del día actual
     */
    static async obtenerPedidosAtrasados() {
        try {
            const ahora = new Date();
            
            // Solo detectar pedidos atrasados del día actual
            // Esto evita alertas de pedidos antiguos que quedaron en este estado
            const [pedidosAtrasados] = await db.execute(
                `SELECT id, hora_esperada_finalizacion, hora_inicio_preparacion
                 FROM pedidos 
                 WHERE estado = 'EN_PREPARACION' 
                   AND hora_esperada_finalizacion IS NOT NULL
                   AND hora_esperada_finalizacion < ?
                   AND DATE(fecha) = CURDATE()
                 ORDER BY hora_esperada_finalizacion ASC`,
                [ahora]
            );
            
            return pedidosAtrasados;
        } catch (error) {
            console.error('Error obteniendo pedidos atrasados:', error);
            return [];
        }
    }
}

module.exports = TimeCalculationService;

