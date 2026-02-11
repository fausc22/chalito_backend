const db = require('../controllers/dbPromise');
const KitchenCapacityService = require('./KitchenCapacityService');

/**
 * Servicio para capacidad adaptativa según carga real
 * Fase 4: Ajusta capacidad máxima según comportamiento real del sistema
 */
class AdaptiveCapacityService {
    /**
     * Analizar carga real del sistema en las últimas horas
     * Ajustar capacidad si es necesario
     */
    static async analizarCargaReal() {
        try {
            // Analizar pedidos de las últimas 4 horas
            const [cargaReciente] = await db.execute(
                `SELECT 
                    COUNT(*) as total_pedidos,
                    AVG(TIMESTAMPDIFF(MINUTE, hora_inicio_preparacion, fecha_modificacion)) as tiempo_promedio
                FROM pedidos 
                WHERE estado = 'ENTREGADO'
                    AND hora_inicio_preparacion IS NOT NULL
                    AND fecha_modificacion >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
                    AND TIMESTAMPDIFF(MINUTE, hora_inicio_preparacion, fecha_modificacion) BETWEEN 5 AND 60`
            );

            if (cargaReciente.length === 0 || cargaReciente[0].total_pedidos < 5) {
                // No hay suficiente data para ajustar
                return null;
            }

            const tiempoPromedio = cargaReciente[0].tiempo_promedio || 15;
            const totalPedidos = cargaReciente[0].total_pedidos || 0;

            // Si el tiempo promedio es muy bajo (< 10 min), la capacidad puede ser mayor
            // Si el tiempo promedio es muy alto (> 25 min), la capacidad debería ser menor
            
            return {
                tiempoPromedio,
                totalPedidos,
                sugerencia: tiempoPromedio < 10 ? 'aumentar' : tiempoPromedio > 25 ? 'reducir' : 'mantener'
            };
        } catch (error) {
            console.error('Error analizando carga real:', error);
            return null;
        }
    }

    /**
     * Obtener capacidad adaptativa según carga y hora del día
     */
    static async obtenerCapacidadAdaptativa() {
        try {
            const capacidadBase = await KitchenCapacityService.obtenerCapacidadMaxima();
            const analisis = await this.analizarCargaReal();

            if (!analisis) {
                return capacidadBase; // Sin datos suficientes, usar base
            }

            let capacidadAjustada = capacidadBase;

            // Ajustar según tiempo promedio
            if (analisis.sugerencia === 'aumentar' && analisis.tiempoPromedio < 10) {
                // Si los pedidos se completan muy rápido, aumentar capacidad
                capacidadAjustada = Math.min(capacidadBase + 2, capacidadBase * 1.25); // Max +25%
            } else if (analisis.sugerencia === 'reducir' && analisis.tiempoPromedio > 25) {
                // Si los pedidos tardan mucho, reducir capacidad
                capacidadAjustada = Math.max(capacidadBase - 2, capacidadBase * 0.75); // Min -25%
            }

            return Math.round(capacidadAjustada);
        } catch (error) {
            console.error('Error obteniendo capacidad adaptativa:', error);
            return await KitchenCapacityService.obtenerCapacidadMaxima();
        }
    }

    /**
     * Verificar si la capacidad actual está causando problemas
     * (muchos pedidos atrasados, tiempos muy largos)
     */
    static async evaluarRendimiento() {
        try {
            // Contar pedidos atrasados recientes del día actual
            const [atrasados] = await db.execute(
                `SELECT COUNT(*) as total
                FROM pedidos 
                WHERE estado = 'EN_PREPARACION'
                    AND hora_inicio_preparacion IS NOT NULL
                    AND hora_esperada_finalizacion IS NOT NULL
                    AND NOW() > hora_esperada_finalizacion
                    AND DATE(fecha) = CURDATE()`
            );

            const totalAtrasados = atrasados[0]?.total || 0;
            
            // Si más del 30% de los pedidos están atrasados, hay un problema
            // Solo contar pedidos del día actual
            const [totalEnPreparacion] = await db.execute(
                `SELECT COUNT(*) as total 
                 FROM pedidos 
                 WHERE estado = ? 
                   AND DATE(fecha) = CURDATE()`,
                ['EN_PREPARACION']
            );
            const total = totalEnPreparacion[0]?.total || 1;
            const porcentajeAtrasados = (totalAtrasados / total) * 100;

            return {
                totalAtrasados,
                totalEnPreparacion: total,
                porcentajeAtrasados,
                necesitaAjuste: porcentajeAtrasados > 30
            };
        } catch (error) {
            console.error('Error evaluando rendimiento:', error);
            return {
                totalAtrasados: 0,
                totalEnPreparacion: 0,
                porcentajeAtrasados: 0,
                necesitaAjuste: false
            };
        }
    }
}

module.exports = AdaptiveCapacityService;

