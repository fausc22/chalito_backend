const db = require('../controllers/dbPromise');

/**
 * Servicio para cálculos de tiempo relacionados con pedidos
 */
class TimeCalculationService {
    /**
     * Calcula la carga total de cocina del pedido:
     * SUM(peso * cantidad)
     */
    static calcularCargaTotal(pedidoItems = []) {
        if (!Array.isArray(pedidoItems) || pedidoItems.length === 0) {
            return 0;
        }

        return pedidoItems.reduce((acumulado, item) => {
            const cantidad = Number(item?.cantidad || 0);
            const peso = Number(item?.peso ?? 1);
            const pesoSeguro = Number.isFinite(peso) && peso > 0 ? peso : 1;
            const cantidadSegura = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;

            return acumulado + (pesoSeguro * cantidadSegura);
        }, 0);
    }

    /**
     * Modelo nuevo:
     * cada 4 puntos de carga => 5 minutos
     */
    static calcularTiempoEstimado(pedidoItems = []) {
        const cargaTotal = this.calcularCargaTotal(pedidoItems);
        return Math.ceil(cargaTotal / 4) * 5;
    }

    /**
     * Obtener tiempo base del pedido desde configuración.
     * Prioriza la clave nueva y mantiene fallback por compatibilidad.
     */
    static async obtenerTiempoBasePedido(connection = db) {
        try {
            const [config] = await connection.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave IN (?, ?) ORDER BY CASE WHEN clave = ? THEN 0 ELSE 1 END LIMIT 1',
                ['TIEMPO_BASE_PEDIDO_MINUTOS', 'tiempo_base_preparacion_minutos', 'TIEMPO_BASE_PEDIDO_MINUTOS']
            );

            if (config.length > 0) {
                return parseInt(config[0].valor, 10) || 15;
            }

            return 15;
        } catch (error) {
            console.error('Error obteniendo tiempo base del pedido:', error);
            return 15;
        }
    }

    /**
     * Calcular tiempo estimado dinámico para un pedido.
     * Obtiene peso actualizado por JOIN con articulos.
     * No modifica base de datos.
     */
    static async calcularTiempoEstimadoPedido(pedidoId, options = {}) {
        const connection = options.connection || db;

        try {
            const [pedidoItems] = await connection.execute(
                `SELECT 
                    pc.articulo_id,
                    pc.cantidad,
                    COALESCE(a.peso, 1) AS peso
                 FROM pedidos_contenido pc
                 LEFT JOIN articulos a ON a.id = pc.articulo_id
                 WHERE pc.pedido_id = ?`,
                [pedidoId]
            );
            const cargaTotal = this.calcularCargaTotal(pedidoItems);
            const tiempoCalculado = this.calcularTiempoEstimado(pedidoItems);
            const tiempoEstimado = Math.max(10, tiempoCalculado); // Mínimo 10 min por pedido (margen base)

            // Log temporal para auditar el nuevo modelo
            console.log(`[TimeCalculationService] Pedido #${pedidoId} -> carga_total=${cargaTotal}, tiempo_estimado=${tiempoEstimado}`);

            return tiempoEstimado;
        } catch (error) {
            console.error(`Error calculando tiempo estimado dinámico para pedido #${pedidoId}:`, error);
            // Fallback seguro: tiempo base configurado
            return this.obtenerTiempoBasePedido(connection);
        }
    }

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

