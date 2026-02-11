const db = require('../controllers/dbPromise');

/**
 * Servicio para gestionar la capacidad de cocina
 */
class KitchenCapacityService {
    /**
     * Obtener capacidad máxima desde configuración
     * Nota: Ahora usa 'MAX_PEDIDOS_EN_PREPARACION' (mayúsculas) para consistencia
     */
    static async obtenerCapacidadMaxima() {
        try {
            const [config] = await db.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                ['MAX_PEDIDOS_EN_PREPARACION']
            );
            
            if (config.length > 0) {
                return parseInt(config[0].valor, 10) || 8; // Default 8
            }
            // Fallback al nombre antiguo por compatibilidad
            const [configOld] = await db.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                ['max_pedidos_en_preparacion']
            );
            if (configOld.length > 0) {
                return parseInt(configOld[0].valor, 10) || 8;
            }
            return 8; // Default si no existe configuración
        } catch (error) {
            console.error('Error obteniendo capacidad máxima:', error);
            return 8; // Default en caso de error
        }
    }

    /**
     * Contar pedidos actualmente en preparación (solo del día actual)
     */
    static async contarPedidosEnPreparacion() {
        try {
            // Solo contar pedidos EN_PREPARACION del día actual
            // Esto evita contar pedidos antiguos que quedaron en este estado
            const [result] = await db.execute(
                `SELECT COUNT(*) as total 
                 FROM pedidos 
                 WHERE estado = ? 
                   AND DATE(fecha) = CURDATE()`,
                ['EN_PREPARACION']
            );
            return result[0].total || 0;
        } catch (error) {
            console.error('Error contando pedidos en preparación:', error);
            return 0;
        }
    }

    /**
     * Verificar si hay capacidad disponible
     */
    static async hayCapacidadDisponible() {
        try {
            const capacidadMaxima = await this.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await this.contarPedidosEnPreparacion();
            return pedidosEnPreparacion < capacidadMaxima;
        } catch (error) {
            console.error('Error verificando capacidad:', error);
            return false; // Por seguridad, no permitir si hay error
        }
    }

    /**
     * Obtener espacios disponibles
     */
    static async obtenerEspaciosDisponibles() {
        try {
            const capacidadMaxima = await this.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await this.contarPedidosEnPreparacion();
            return Math.max(0, capacidadMaxima - pedidosEnPreparacion);
        } catch (error) {
            console.error('Error obteniendo espacios disponibles:', error);
            return 0;
        }
    }

    /**
     * Obtener información completa de capacidad
     */
    static async obtenerInfoCapacidad() {
        try {
            const capacidadMaxima = await this.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await this.contarPedidosEnPreparacion();
            const espaciosDisponibles = capacidadMaxima - pedidosEnPreparacion;

            return {
                capacidadMaxima,
                pedidosEnPreparacion,
                espaciosDisponibles,
                porcentajeUso: capacidadMaxima > 0 
                    ? Math.round((pedidosEnPreparacion / capacidadMaxima) * 100)
                    : 0,
                estaLlena: pedidosEnPreparacion >= capacidadMaxima
            };
        } catch (error) {
            console.error('Error obteniendo info de capacidad:', error);
            return {
                capacidadMaxima: 8,
                pedidosEnPreparacion: 0,
                espaciosDisponibles: 0,
                porcentajeUso: 0,
                estaLlena: false
            };
        }
    }
}

module.exports = KitchenCapacityService;

