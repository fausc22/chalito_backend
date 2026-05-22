const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');
const OrderQueueWorker = require('../workers/OrderQueueWorker');

const CLAVES_OPERATIVAS_UI_PERMITIDAS = [
    'MAX_PEDIDOS_EN_PREPARACION',
    'TIEMPO_BASE_PEDIDO_MINUTOS'
];

const CLAVES_UI_BLOQUEADAS = [
    'INTERVALO_WORKER_SEGUNDOS',
    'worker_interval_segundos',
    'DEMORA_COCINA_MANUAL_MINUTOS'
];

const convertirValorSegunTipo = (tipo, valorOriginal) => {
    if (tipo === 'INT') {
        return parseInt(valorOriginal, 10);
    }
    if (tipo === 'BOOLEAN') {
        return valorOriginal === 'true' || valorOriginal === '1';
    }
    if (tipo === 'JSON') {
        try {
            return JSON.parse(valorOriginal);
        } catch (e) {
            return valorOriginal;
        }
    }

    return valorOriginal;
};

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
            const valor = convertirValorSegunTipo(config.tipo, config.valor);
            
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
        const valor = convertirValorSegunTipo(config.tipo, config.valor);
        
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
        
        const BRANDING_KEYS = new Set([
            'COLOR_PRIMARIO',
            'TIENDA_COLOR_PRIMARIO',
            'TIENDA_COLOR_SECUNDARIO'
        ]);
        if (BRANDING_KEYS.has(clave)) {
            try {
                require('../services/brandingSettingsService').invalidateCache();
            } catch (_) {
                /* servicio opcional en entornos mínimos */
            }
        }

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

/**
 * Actualizar configuraciones operativas de UI (bulk)
 * PUT /configuracion-sistema
 */
const actualizarConfiguracionOperativa = async (req, res) => {
    try {
        const payload = req.body || {};
        const clavesRecibidas = Object.keys(payload);

        if (!clavesRecibidas.length) {
            return res.status(400).json({
                success: false,
                message: 'Debe enviar al menos una configuración para actualizar'
            });
        }

        const claveBloqueada = clavesRecibidas.find((clave) => CLAVES_UI_BLOQUEADAS.includes(clave));
        if (claveBloqueada) {
            return res.status(400).json({
                success: false,
                message: `La clave "${claveBloqueada}" no puede modificarse desde esta UI`
            });
        }

        const clavesNoPermitidas = clavesRecibidas.filter(
            (clave) => !CLAVES_OPERATIVAS_UI_PERMITIDAS.includes(clave)
        );

        if (clavesNoPermitidas.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Solo se permiten estas claves: ${CLAVES_OPERATIVAS_UI_PERMITIDAS.join(', ')}`,
                clavesNoPermitidas
            });
        }

        const actualizadas = [];
        for (const clave of clavesRecibidas) {
            const valor = payload[clave];
            const datosAnteriores = await obtenerDatosAnteriores('configuracion_sistema', clave, 'clave');

            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: `Configuración no encontrada: ${clave}`
                });
            }

            let valorString = String(valor);
            if (datosAnteriores.tipo === 'JSON') {
                valorString = JSON.stringify(valor);
            } else if (datosAnteriores.tipo === 'BOOLEAN') {
                valorString = valor ? 'true' : 'false';
            }

            await db.execute(
                'UPDATE configuracion_sistema SET valor = ? WHERE clave = ?',
                [valorString, clave]
            );

            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'configuracion_sistema',
                registroId: clave,
                datosAnteriores,
                datosNuevos: { ...datosAnteriores, valor: valorString },
                detallesAdicionales: `Configuración operativa UI "${clave}" actualizada: ${datosAnteriores.valor} → ${valorString}`
            });

            actualizadas.push({
                clave,
                valor: convertirValorSegunTipo(datosAnteriores.tipo, valorString)
            });
        }

        return res.json({
            success: true,
            message: 'Configuraciones operativas actualizadas correctamente',
            data: actualizadas
        });
    } catch (error) {
        console.error('❌ Error al actualizar configuración operativa:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración operativa'
        });
    }
};

module.exports = {
    obtenerConfiguraciones,
    obtenerConfiguracion,
    actualizarConfiguracion,
    actualizarConfiguracionOperativa
};








