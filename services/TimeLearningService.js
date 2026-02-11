const db = require('../controllers/dbPromise');

/**
 * Servicio para aprendizaje automático de tiempos de preparación
 * Fase 4: Ajusta tiempo_estimado_preparacion según histórico
 */
class TimeLearningService {
    /**
     * Calcular tiempo promedio real de preparación para un pedido
     * Basado en pedidos históricos similares
     */
    static async calcularTiempoEstimadoMejorado(pedidoId = null, articulos = []) {
        try {
            // Por ahora, usar un enfoque simple: promedio de últimos 50 pedidos completados
            const [historico] = await db.execute(
                `SELECT 
                    AVG(TIMESTAMPDIFF(MINUTE, hora_inicio_preparacion, fecha_modificacion)) as tiempo_promedio
                FROM pedidos 
                WHERE estado = 'ENTREGADO'
                    AND hora_inicio_preparacion IS NOT NULL
                    AND fecha_modificacion IS NOT NULL
                    AND TIMESTAMPDIFF(MINUTE, hora_inicio_preparacion, fecha_modificacion) BETWEEN 5 AND 60
                    AND fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                ORDER BY fecha DESC
                LIMIT 50`
            );

            if (historico.length > 0 && historico[0].tiempo_promedio) {
                const tiempoAprendido = Math.round(historico[0].tiempo_promedio);
                // Asegurar un mínimo de 10 minutos y máximo de 45 minutos
                return Math.max(10, Math.min(45, tiempoAprendido));
            }

            // Si no hay histórico suficiente, retornar el valor por defecto
            return 15;
        } catch (error) {
            console.error('Error calculando tiempo estimado mejorado:', error);
            return 15; // Default
        }
    }

    /**
     * Actualizar tiempo estimado de un pedido cuando se completa
     * Guardar el tiempo real para aprendizaje futuro
     */
    static async registrarTiempoReal(pedidoId, tiempoRealMinutos) {
        try {
            // El tiempo real ya está registrado en la BD (hora_inicio_preparacion y fecha_modificacion)
            // Esta función puede ser usada para análisis adicional o métricas
            console.log(`📊 [TimeLearning] Tiempo real registrado para pedido #${pedidoId}: ${tiempoRealMinutos} minutos`);
            
            // Opcional: Guardar métricas en una tabla separada para análisis más avanzado
            // Por ahora solo logueamos
            return true;
        } catch (error) {
            console.error('Error registrando tiempo real:', error);
            return false;
        }
    }

    /**
     * Recalcular tiempos estimados basados en histórico reciente
     * Ejecutar periódicamente para ajustar valores base
     */
    static async recalcularTiempoBase() {
        try {
            const tiempoBase = await this.calcularTiempoEstimadoMejorado();
            
            // Actualizar configuración del sistema si el nuevo valor es significativamente diferente
            const [configActual] = await db.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave IN (?, ?)',
                ['TIEMPO_BASE_PEDIDO_MINUTOS', 'tiempo_base_preparacion_minutos']
            );
            
            const tiempoActual = configActual.length > 0 ? parseInt(configActual[0].valor) : 15;
            
            // Solo actualizar si la diferencia es significativa (más de 2 minutos)
            if (Math.abs(tiempoBase - tiempoActual) > 2) {
                await db.execute(
                    'UPDATE configuracion_sistema SET valor = ? WHERE clave IN (?, ?)',
                    [String(tiempoBase), 'TIEMPO_BASE_PEDIDO_MINUTOS', 'tiempo_base_preparacion_minutos']
                );
                console.log(`📊 [TimeLearning] Tiempo base actualizado: ${tiempoActual} -> ${tiempoBase} minutos`);
                return tiempoBase;
            }
            
            return tiempoActual;
        } catch (error) {
            console.error('Error recalculando tiempo base:', error);
            return 15; // Default
        }
    }

    /**
     * Obtener tiempo estimado adaptativo para un pedido específico
     * Considera factores como cantidad de artículos, complejidad, etc.
     */
    static async obtenerTiempoEstimadoAdaptativo(articulos = []) {
        try {
            const tiempoBase = await this.calcularTiempoEstimadoMejorado();
            
            // Ajustar según cantidad de artículos (ejemplo simple)
            const factorCantidad = Math.min(1.5, 1 + (articulos.length * 0.05)); // +5% por artículo, max 50%
            
            // Ajustar según tipo de artículos (ejemplo: artículos elaborados toman más tiempo)
            // Por ahora usamos un factor simple
            
            const tiempoAjustado = Math.round(tiempoBase * factorCantidad);
            
            // Límites: mínimo 10, máximo 45 minutos
            return Math.max(10, Math.min(45, tiempoAjustado));
        } catch (error) {
            console.error('Error obteniendo tiempo estimado adaptativo:', error);
            return 15; // Default
        }
    }
}

module.exports = TimeLearningService;

