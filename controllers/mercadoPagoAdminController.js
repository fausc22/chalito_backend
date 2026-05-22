const mercadoPagoAdminService = require('../services/mercadoPagoAdminService');

const obtenerEstadoIntegracion = async (req, res) => {
    try {
        const data = await mercadoPagoAdminService.getIntegracionEstado();
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error obteniendo estado MP:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    obtenerEstadoIntegracion
};
