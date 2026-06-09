const whatsappService = require('../services/whatsappService');
const whatsappSettingsService = require('../services/whatsappSettingsService');
const {
    buildMessagePreviews,
    isAliasTransferenciaValido,
} = require('../services/whatsappMessageBuilder');

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
        const previews = buildMessagePreviews(
            settings.nombreNegocio,
            isAliasTransferenciaValido(settings.aliasTransferencia)
                ? settings.aliasTransferencia
                : 'tu.alias.mp'
        );
        res.json({ success: true, data: previews });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const actualizarSettings = async (req, res) => {
    try {
        const { notificacionesActivas, aliasTransferencia } = req.body || {};

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

        const data = await whatsappSettingsService.updateSettings({
            notificacionesActivas,
            aliasTransferencia,
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
