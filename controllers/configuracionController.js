const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');
const OrderQueueWorker = require('../workers/OrderQueueWorker');

/**
 * Obtener todas las configuraciones
 * GET /configuracion-sistema
 */
const obtenerConfiguraciones = async (req, res) => {
    try {
        const [configuraciones] = await db.execute(
            'SELECT * FROM configuracion_sistema ORDER BY clave ASC'
        );
        
        // Transformar a objeto clave-valor para fácil acceso
        const configObj = {};
        configuraciones.forEach(config => {
            let valor = config.valor;
            
            // Convertir según tipo
            if (config.tipo === 'INT') {
                valor = parseInt(valor, 10);
            } else if (config.tipo === 'BOOLEAN') {
                valor = valor === 'true' || valor === '1';
            } else if (config.tipo === 'JSON') {
                try {
                    valor = JSON.parse(valor);
                } catch (e) {
                    valor = config.valor;
                }
            }
            
            configObj[config.clave] = {
                valor,
                tipo: config.tipo,
                descripcion: config.descripcion,
                fechaModificacion: config.fecha_modificacion
            };
        });
        
        res.json({
            success: true,
            data: configuraciones,
            config: configObj // Versión objeto para fácil acceso
        });
    } catch (error) {
        console.error('❌ Error al obtener configuraciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuraciones'
        });
    }
};

/**
 * Obtener una configuración por clave
 * GET /configuracion-sistema/:clave
 */
const obtenerConfiguracion = async (req, res) => {
    try {
        const { clave } = req.params;
        
        const [configuraciones] = await db.execute(
            'SELECT * FROM configuracion_sistema WHERE clave = ?',
            [clave]
        );
        
        if (configuraciones.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }
        
        const config = configuraciones[0];
        let valor = config.valor;
        
        // Convertir según tipo
        if (config.tipo === 'INT') {
            valor = parseInt(valor, 10);
        } else if (config.tipo === 'BOOLEAN') {
            valor = valor === 'true' || valor === '1';
        } else if (config.tipo === 'JSON') {
            try {
                valor = JSON.parse(valor);
            } catch (e) {
                valor = config.valor;
            }
        }
        
        res.json({
            success: true,
            data: {
                ...config,
                valor
            }
        });
    } catch (error) {
        console.error('❌ Error al obtener configuración:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración'
        });
    }
};

/**
 * Actualizar una configuración
 * PUT /configuracion-sistema/:clave
 */
const actualizarConfiguracion = async (req, res) => {
    try {
        const { clave } = req.params;
        const { valor } = req.body;
        
        // Verificar que la configuración existe
        const datosAnteriores = await obtenerDatosAnteriores('configuracion_sistema', clave, 'clave');
        
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }
        
        // Convertir valor a string según tipo
        let valorString = String(valor);
        if (datosAnteriores.tipo === 'JSON') {
            valorString = JSON.stringify(valor);
        } else if (datosAnteriores.tipo === 'BOOLEAN') {
            valorString = valor ? 'true' : 'false';
        }
        
        // Actualizar configuración
        await db.execute(
            'UPDATE configuracion_sistema SET valor = ? WHERE clave = ?',
            [valorString, clave]
        );
        
        // Si se actualiza worker_interval_segundos, reiniciar worker
        if (clave === 'worker_interval_segundos' && OrderQueueWorker.isRunning) {
            const nuevoIntervalo = parseInt(valor, 10);
            if (nuevoIntervalo > 0) {
                await OrderQueueWorker.updateInterval(nuevoIntervalo);
                console.log(`🔄 [Configuración] Worker reiniciado con nuevo intervalo: ${nuevoIntervalo}s`);
            }
        }
        
        // Auditoría
        await auditarOperacion(req, {
            accion: 'UPDATE',
            tabla: 'configuracion_sistema',
            registroId: clave,
            datosAnteriores,
            datosNuevos: { ...datosAnteriores, valor: valorString },
            detallesAdicionales: `Configuración "${clave}" actualizada: ${datosAnteriores.valor} → ${valorString}`
        });
        
        res.json({
            success: true,
            message: 'Configuración actualizada correctamente',
            data: {
                clave,
                valor: datosAnteriores.tipo === 'INT' ? parseInt(valor, 10) : 
                       datosAnteriores.tipo === 'BOOLEAN' ? (valor === 'true' || valor === true) : valor
            }
        });
    } catch (error) {
        console.error('❌ Error al actualizar configuración:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración'
        });
    }
};

module.exports = {
    obtenerConfiguraciones,
    obtenerConfiguracion,
    actualizarConfiguracion
};








