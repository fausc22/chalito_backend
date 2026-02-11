const db = require('../controllers/dbPromise');
const KitchenCapacityService = require('./KitchenCapacityService');

/**
 * Servicio para predecir demoras de cocina automáticamente
 * Fase 4: Calcula DEMORA_COCINA_MANUAL_MINUTOS basado en carga actual
 */
class DelayPredictionService {
    /**
     * Calcular demora actual de cocina basada en pedidos en cola
     */
    static async calcularDemoraActual() {
        try {
            // Obtener pedidos en preparación del día actual y sus tiempos estimados
            const [pedidosEnPreparacion] = await db.execute(
                `SELECT 
                    tiempo_estimado_preparacion,
                    hora_inicio_preparacion,
                    hora_esperada_finalizacion
                FROM pedidos 
                WHERE estado = 'EN_PREPARACION'
                    AND hora_inicio_preparacion IS NOT NULL
                    AND DATE(fecha) = CURDATE()
                ORDER BY hora_esperada_finalizacion ASC`
            );

            if (pedidosEnPreparacion.length === 0) {
                return 0; // Sin demora si no hay pedidos
            }

            // Calcular tiempo hasta que se libere el próximo espacio
            const ahora = new Date();
            let demoraMinutos = 0;

            // Si hay espacios disponibles inmediatamente, demora = 0
            const capacidadMaxima = await KitchenCapacityService.obtenerCapacidadMaxima();
            const espaciosDisponibles = capacidadMaxima - pedidosEnPreparacion.length;

            if (espaciosDisponibles > 0) {
                return 0; // Hay espacio disponible
            }

            // Si la cocina está llena, calcular cuánto falta para que se libere el próximo pedido
            // Los pedidos ya están filtrados por fecha actual en la query anterior
            const pedidosOrdenados = pedidosEnPreparacion
                .filter(p => p.hora_esperada_finalizacion)
                .map(p => new Date(p.hora_esperada_finalizacion))
                .sort((a, b) => a - b);

            if (pedidosOrdenados.length > 0) {
                const proximaLiberacion = pedidosOrdenados[0];
                demoraMinutos = Math.max(0, Math.round((proximaLiberacion - ahora) / (1000 * 60)));
            }

            // Agregar tiempo promedio de preparación como buffer
            const [tiempoPromedio] = await db.execute(
                `SELECT AVG(tiempo_estimado_preparacion) as promedio
                FROM pedidos 
                WHERE estado = 'ENTREGADO'
                    AND hora_inicio_preparacion IS NOT NULL
                    AND fecha >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    AND TIMESTAMPDIFF(MINUTE, hora_inicio_preparacion, fecha_modificacion) BETWEEN 5 AND 60`
            );

            const bufferMinutos = tiempoPromedio[0]?.promedio || 15;
            const demoraTotal = demoraMinutos + Math.round(bufferMinutos * 0.5); // Buffer de 50% del tiempo promedio

            return Math.max(0, Math.min(demoraTotal, 60)); // Max 60 minutos
        } catch (error) {
            console.error('Error calculando demora actual:', error);
            return 0;
        }
    }

    /**
     * Actualizar DEMORA_COCINA_MANUAL_MINUTOS automáticamente
     */
    static async actualizarDemoraAutomatica() {
        try {
            const demoraCalculada = await this.calcularDemoraActual();

            // Actualizar configuración del sistema
            // Intentar con ambos nombres para compatibilidad
            await db.execute(
                `UPDATE configuracion_sistema 
                SET valor = ? 
                WHERE clave IN ('DEMORA_COCINA_MANUAL_MINUTOS', 'demora_cocina_minutos')`,
                [String(demoraCalculada)]
            );

            console.log(`⏱️ [DelayPrediction] Demora cocina actualizada automáticamente: ${demoraCalculada} minutos`);
            
            return demoraCalculada;
        } catch (error) {
            console.error('Error actualizando demora automática:', error);
            return 0;
        }
    }

    /**
     * Obtener demora estimada para un nuevo pedido
     */
    static async obtenerDemoraEstimadaParaNuevoPedido() {
        try {
            const demoraActual = await this.calcularDemoraActual();
            
            // Si hay capacidad disponible, no hay demora
            const capacidadMaxima = await KitchenCapacityService.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await KitchenCapacityService.contarPedidosEnPreparacion();
            
            if (pedidosEnPreparacion < capacidadMaxima) {
                return 0;
            }

            return demoraActual;
        } catch (error) {
            console.error('Error obteniendo demora estimada:', error);
            return 0;
        }
    }
}

module.exports = DelayPredictionService;

