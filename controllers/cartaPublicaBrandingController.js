const brandingSettingsService = require('../services/brandingSettingsService');

const obtenerBrandingPublico = async (req, res) => {
    try {
        const branding = await brandingSettingsService.getPublicBranding();
        res.json({
            success: true,
            ...branding
        });
    } catch (error) {
        console.error('Error obteniendo branding público:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener branding'
        });
    }
};

module.exports = {
    obtenerBrandingPublico
};
