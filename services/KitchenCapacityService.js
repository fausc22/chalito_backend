const db = require('../controllers/dbPromise');

const CLAVE_CAPACIDAD = 'MAX_PEDIDOS_EN_PREPARACION';
const CLAVE_CAPACIDAD_LEGACY = 'max_pedidos_en_preparacion';
const CAPACIDAD_DEFAULT = 8;
const CAPACIDAD_MIN = 1;
const CAPACIDAD_MAX = 200;

/**
 * Servicio para gestionar la capacidad de cocina
 */
class KitchenCapacityService {
    static normalizarCapacidad(raw, fallback = CAPACIDAD_DEFAULT) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return fallback;
        if (parsed < CAPACIDAD_MIN || parsed > CAPACIDAD_MAX) return fallback;
        return parsed;
    }

    /**
     * Obtener capacidad máxima desde configuración
     * Nota: Usa 'MAX_PEDIDOS_EN_PREPARACION' (mayúsculas) con fallback legacy.
     */
    static async obtenerCapacidadMaxima(connection = null) {
        const executor = connection || db;
        try {
            const [config] = await executor.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                [CLAVE_CAPACIDAD]
            );

            if (config.length > 0) {
                return this.normalizarCapacidad(config[0].valor);
            }

            const [configOld] = await executor.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                [CLAVE_CAPACIDAD_LEGACY]
            );
            if (configOld.length > 0) {
                return this.normalizarCapacidad(configOld[0].valor);
            }
            return CAPACIDAD_DEFAULT;
        } catch (error) {
            console.error('Error obteniendo capacidad máxima:', error);
            return CAPACIDAD_DEFAULT;
        }
    }

    /**
     * Contar pedidos actualmente en preparación (solo del día actual)
     */
    static async contarPedidosEnPreparacion(connection = null) {
        const executor = connection || db;
        try {
            const [result] = await executor.execute(
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
     * Bloquea la fila canónica de configuración para serializar ingresos a cocina.
     * Si no existe la clave, no falla: solo evita el lock (fallback seguro).
     */
    static async bloquearConfiguracionCapacidad(connection) {
        if (!connection) {
            throw new Error('Se requiere connection para bloquear capacidad');
        }
        const [rows] = await connection.execute(
            `SELECT clave, valor
             FROM configuracion_sistema
             WHERE clave IN (?, ?)
             ORDER BY CASE WHEN clave = ? THEN 0 ELSE 1 END
             LIMIT 1
             FOR UPDATE`,
            [CLAVE_CAPACIDAD, CLAVE_CAPACIDAD_LEGACY, CLAVE_CAPACIDAD]
        );
        return rows[0] || null;
    }

    /**
     * Info de capacidad dentro de una transacción (tras bloquear config).
     */
    static async obtenerInfoCapacidadEnTransaccion(connection) {
        await this.bloquearConfiguracionCapacidad(connection);
        const capacidadMaxima = await this.obtenerCapacidadMaxima(connection);
        const pedidosEnPreparacion = await this.contarPedidosEnPreparacion(connection);
        const espaciosDisponibles = Math.max(0, capacidadMaxima - pedidosEnPreparacion);

        return {
            capacidadMaxima,
            pedidosEnPreparacion,
            espaciosDisponibles,
            porcentajeUso: capacidadMaxima > 0
                ? Math.round((pedidosEnPreparacion / capacidadMaxima) * 100)
                : 0,
            estaLlena: pedidosEnPreparacion >= capacidadMaxima
        };
    }

    /**
     * Verificar si hay capacidad disponible
     */
    static async hayCapacidadDisponible(connection = null) {
        try {
            if (connection) {
                const info = await this.obtenerInfoCapacidadEnTransaccion(connection);
                return !info.estaLlena;
            }
            const capacidadMaxima = await this.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await this.contarPedidosEnPreparacion();
            return pedidosEnPreparacion < capacidadMaxima;
        } catch (error) {
            console.error('Error verificando capacidad:', error);
            return false;
        }
    }

    /**
     * Obtener espacios disponibles
     */
    static async obtenerEspaciosDisponibles(connection = null) {
        try {
            if (connection) {
                const info = await this.obtenerInfoCapacidadEnTransaccion(connection);
                return info.espaciosDisponibles;
            }
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
    static async obtenerInfoCapacidad(connection = null) {
        try {
            if (connection) {
                return await this.obtenerInfoCapacidadEnTransaccion(connection);
            }
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
                capacidadMaxima: CAPACIDAD_DEFAULT,
                pedidosEnPreparacion: 0,
                espaciosDisponibles: 0,
                porcentajeUso: 0,
                estaLlena: false
            };
        }
    }
}

module.exports = KitchenCapacityService;
module.exports.CAPACIDAD_MIN = CAPACIDAD_MIN;
module.exports.CAPACIDAD_MAX = CAPACIDAD_MAX;
module.exports.CAPACIDAD_DEFAULT = CAPACIDAD_DEFAULT;
module.exports.CLAVE_CAPACIDAD = CLAVE_CAPACIDAD;
