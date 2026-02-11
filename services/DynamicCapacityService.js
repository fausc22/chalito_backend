const db = require('../controllers/dbPromise');
const KitchenCapacityService = require('./KitchenCapacityService');

/**
 * Servicio para capacidad dinámica según hora del día
 * Fase 3: Capacidad dinámica
 */
class DynamicCapacityService {
    /**
     * Obtener capacidad máxima según hora del día
     * Por ahora usa configuración fija, pero preparado para lógica dinámica
     */
    static async obtenerCapacidadMaxima(horaActual = null) {
        try {
            // Por ahora, obtener desde configuración (comportamiento actual)
            // En el futuro, se puede agregar lógica según hora del día
            const capacidadBase = await KitchenCapacityService.obtenerCapacidadMaxima();
            
            // Obtener configuración de capacidad dinámica (si existe)
            const [configDinamica] = await db.execute(
                'SELECT valor FROM configuracion_sistema WHERE clave = ?',
                ['capacidad_dinamica_habilitada']
            );
            
            const capacidadDinamicaHabilitada = configDinamica.length > 0 && configDinamica[0].valor === 'true';
            
            if (!capacidadDinamicaHabilitada) {
                // Capacidad fija (comportamiento actual)
                return capacidadBase;
            }
            
            // Lógica dinámica basada en hora del día
            const ahora = horaActual || new Date();
            const hora = ahora.getHours();
            const diaSemana = ahora.getDay(); // 0 = Domingo, 6 = Sábado
            
            // Ajustes según hora del día
            let multiplicador = 1.0;
            
            // Horas pico (12:00-14:00 y 19:00-21:00): más capacidad
            if ((hora >= 12 && hora < 14) || (hora >= 19 && hora < 21)) {
                multiplicador = 1.2; // +20% en horas pico
            }
            // Horas valle (14:00-17:00): menos capacidad
            else if (hora >= 14 && hora < 17) {
                multiplicador = 0.8; // -20% en horas valle
            }
            // Horas muy temprano o muy tarde: menos capacidad
            else if (hora < 10 || hora >= 22) {
                multiplicador = 0.7; // -30% fuera de horario normal
            }
            
            // Ajustes según día de la semana
            if (diaSemana === 0 || diaSemana === 6) {
                // Fines de semana: más capacidad
                multiplicador += 0.1;
            }
            
            const capacidadCalculada = Math.round(capacidadBase * multiplicador);
            
            // Límites mínimos y máximos
            const capacidadMinima = Math.max(1, Math.round(capacidadBase * 0.5));
            const capacidadMaxima = Math.round(capacidadBase * 1.5);
            
            return Math.max(capacidadMinima, Math.min(capacidadCalculada, capacidadMaxima));
            
        } catch (error) {
            console.error('Error obteniendo capacidad dinámica:', error);
            // Fallback a capacidad fija
            return await KitchenCapacityService.obtenerCapacidadMaxima();
        }
    }

    /**
     * Obtener información completa de capacidad (incluyendo dinámica)
     */
    static async obtenerInfoCapacidad() {
        try {
            const capacidadMaxima = await this.obtenerCapacidadMaxima();
            const pedidosEnPreparacion = await KitchenCapacityService.contarPedidosEnPreparacion();
            const espaciosDisponibles = capacidadMaxima - pedidosEnPreparacion;

            return {
                capacidadMaxima,
                pedidosEnPreparacion,
                espaciosDisponibles,
                porcentajeUso: capacidadMaxima > 0 
                    ? Math.round((pedidosEnPreparacion / capacidadMaxima) * 100)
                    : 0,
                estaLlena: pedidosEnPreparacion >= capacidadMaxima,
                esDinamica: true // Indicar si está usando capacidad dinámica
            };
        } catch (error) {
            console.error('Error obteniendo info de capacidad dinámica:', error);
            return await KitchenCapacityService.obtenerInfoCapacidad();
        }
    }
}

module.exports = DynamicCapacityService;








