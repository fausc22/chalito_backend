const whatsappService = require('../services/whatsappService');
const whatsappSettingsService = require('../services/whatsappSettingsService');
const {
    buildMessagePreviews,
    isAliasTransferenciaValido,
} = require('../services/whatsappMessageBuilder');
const {
    validatePlantillasPayload,
    validatePlantillasClienteLocalPayload,
    hasValidationErrors,
} = require('../services/whatsappTemplateValidator');

const whatsappEstado = async (req, res) => {
    try {
        res.json({ success: true, ...whatsappService.obtenerEstado() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const whatsappQr = async (req, res) => {
    try {
        if (whatsappService.estaConectado()) {
            const estado = whatsappService.obtenerEstado();
            return res.json({
                success: true,
                connected: true,
                phone: estado.phone
            });
        }

        const qr = whatsappService.obtenerQR();
        if (!qr) {
            return res.json({
                success: true,
                connected: false,
                hasQR: false,
                qr: null
            });
        }

        const base64 = qr.replace(/^data:image\/png;base64,/, '');
        res.json({
            success: true,
            connected: false,
            hasQR: true,
            qr: base64
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const whatsappConectar = async (req, res) => {
    try {
        const result = await whatsappService.iniciarSesion();
        res.json({ success: true, ok: true, message: result.message || 'Sesión iniciada' });
    } catch (error) {
        console.error('whatsappConectar:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const whatsappDesconectar = async (req, res) => {
    try {
        await whatsappService.desconectarYLimpiarAuth();
        res.json({ success: true, message: 'WhatsApp desconectado' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const obtenerSettings = async (req, res) => {
    try {
        const settings = await whatsappSettingsService.getSettings();
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const obtenerPreviews = async (req, res) => {
    try {
        const settings = await whatsappSettingsService.getSettings();
        const aliasPreview = isAliasTransferenciaValido(settings.aliasTransferencia)
            ? settings.aliasTransferencia
            : 'tu.alias.mp';
        const previews = buildMessagePreviews(
            settings.nombreNegocio,
            aliasPreview,
            settings.plantillas
        );
        res.json({ success: true, data: previews });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const parseFlag = (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return undefined;
};

const actualizarSettings = async (req, res) => {
    try {
        const {
            notificacionesActivas,
            aliasTransferencia,
            plantillas,
            plantillasClienteLocal,
            clienteEnviaAlLocal,
            numeroContacto,
            templateClienteAlLocal,
        } = req.body || {};

        const notifFlag = parseFlag(notificacionesActivas);
        const clienteFlag = parseFlag(clienteEnviaAlLocal);

        if (notifFlag === true && clienteFlag === true) {
            return res.status(400).json({
                success: false,
                message: 'Los modos local→cliente y cliente→local no pueden estar activos a la vez',
            });
        }

        const current = await whatsappSettingsService.getSettings();
        const effectiveNotif =
            notifFlag !== undefined ? notifFlag : current.notificacionesActivas;
        const effectiveCliente =
            clienteFlag !== undefined ? clienteFlag : current.clienteEnviaAlLocal;

        const modoPayload = whatsappSettingsService.deriveModoPedidosWeb({
            notificacionesActivas: effectiveNotif,
            clienteEnviaAlLocal: effectiveCliente,
        });

        if (aliasTransferencia !== undefined) {
            const trimmed = String(aliasTransferencia).trim();
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    message: 'El alias de transferencia no puede estar vacio',
                });
            }
            if (trimmed.length > 120) {
                return res.status(400).json({
                    success: false,
                    message: 'El alias de transferencia es demasiado largo',
                });
            }
        }

        if (plantillas !== undefined) {
            if (typeof plantillas !== 'object' || plantillas === null || Array.isArray(plantillas)) {
                return res.status(400).json({
                    success: false,
                    message: 'El campo plantillas debe ser un objeto',
                });
            }

            if (modoPayload === 'local_a_cliente') {
                const errors = validatePlantillasPayload(plantillas);
                if (hasValidationErrors(errors)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Hay plantillas con placeholders obligatorios faltantes',
                        errors,
                    });
                }
            }
        }

        if (plantillasClienteLocal !== undefined) {
            if (
                typeof plantillasClienteLocal !== 'object' ||
                plantillasClienteLocal === null ||
                Array.isArray(plantillasClienteLocal)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'El campo plantillasClienteLocal debe ser un objeto',
                });
            }

            if (modoPayload === 'cliente_a_local') {
                const errors = validatePlantillasClienteLocalPayload(plantillasClienteLocal);
                if (hasValidationErrors(errors)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Hay plantillas cliente→local con placeholders obligatorios faltantes',
                        errors,
                    });
                }
            }
        }

        const data = await whatsappSettingsService.updateSettings({
            notificacionesActivas: notifFlag,
            aliasTransferencia,
            plantillas,
            plantillasClienteLocal,
            clienteEnviaAlLocal: clienteFlag,
            numeroContacto,
            templateClienteAlLocal,
        });

        res.json({ success: true, message: 'Configuración guardada', data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    whatsappEstado,
    whatsappQr,
    whatsappConectar,
    whatsappDesconectar,
    obtenerSettings,
    actualizarSettings,
    obtenerPreviews,
};
