const horariosTiendaRepository = require('../repositories/horariosTiendaRepository');
const tiendaOnlineSettingsService = require('../services/tiendaOnlineSettingsService');
const brandingSettingsService = require('../services/brandingSettingsService');
const carouselSettingsService = require('../services/carouselSettingsService');
const { uploadImageToFileServer } = require('../config/fileStorage');
const storeScheduleService = require('../services/storeScheduleService');
const envioGratisSettingsService = require('../services/envioGratisSettingsService');

const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const normalizeTime = (value) => {
    const text = String(value || '').trim();
    if (!TIME_REGEX.test(text)) return null;
    const parts = text.split(':');
    if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1]}:00`;
    return `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2]}`;
};

const validateFranjas = (franjas) => {
    if (!Array.isArray(franjas)) {
        return 'franjas debe ser un array';
    }

    for (const franja of franjas) {
        if (!franja || typeof franja !== 'object') {
            return 'Cada franja debe ser un objeto válido';
        }
        if (!franja.activo) continue;

        const apertura = normalizeTime(franja.hora_apertura);
        const cierre = normalizeTime(franja.hora_cierre);
        if (!apertura || !cierre) {
            return 'hora_apertura y hora_cierre deben tener formato HH:mm';
        }
        if (apertura >= cierre) {
            return 'hora_apertura debe ser menor que hora_cierre (sin cruce de medianoche en Fase 1)';
        }
        franja.hora_apertura = apertura;
        franja.hora_cierre = cierre;
    }

    return null;
};

const obtenerHorarios = async (req, res) => {
    try {
        const horarios = await horariosTiendaRepository.findAll();
        res.json({ success: true, data: { horarios } });
    } catch (error) {
        console.error('Error obteniendo horarios tienda:', error);
        res.status(500).json({ success: false, message: 'Error al obtener horarios' });
    }
};

const actualizarHorarioDia = async (req, res) => {
    try {
        const diaSemana = Number(req.body?.dia_semana);
        const franjas = req.body?.franjas;

        if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
            return res.status(400).json({
                success: false,
                message: 'dia_semana debe ser un entero entre 0 y 6'
            });
        }

        const franjasError = validateFranjas(franjas);
        if (franjasError) {
            return res.status(400).json({ success: false, message: franjasError });
        }

        await horariosTiendaRepository.replaceDay(diaSemana, franjas);
        storeScheduleService.invalidateScheduleCache();

        const horarios = await horariosTiendaRepository.findAll();
        res.json({
            success: true,
            message: 'Horarios actualizados correctamente',
            data: { horarios }
        });
    } catch (error) {
        console.error('Error actualizando horario del dia:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar horarios' });
    }
};

const obtenerSettings = async (req, res) => {
    try {
        const settings = await tiendaOnlineSettingsService.getSettings();
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error obteniendo settings tienda online:', error);
        res.status(500).json({ success: false, message: 'Error al obtener configuración' });
    }
};

const actualizarSettings = async (req, res) => {
    try {
        const { tiendaOnlineActiva, validarHorarios, toleranceMinutes } = req.body || {};

        if (toleranceMinutes !== undefined) {
            const parsed = Number.parseInt(String(toleranceMinutes), 10);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) {
                return res.status(400).json({
                    success: false,
                    message: 'toleranceMinutes debe estar entre 0 y 120'
                });
            }
        }

        const settings = await tiendaOnlineSettingsService.updateSettings({
            tiendaOnlineActiva,
            validarHorarios,
            toleranceMinutes
        });

        storeScheduleService.invalidateScheduleCache();

        res.json({
            success: true,
            message: 'Configuración actualizada',
            data: settings
        });
    } catch (error) {
        console.error('Error actualizando settings tienda online:', error);
        res.status(500).json({ success: false, message: 'Error al guardar configuración' });
    }
};

const obtenerEstado = async (req, res) => {
    try {
        const estado = await storeScheduleService.getEstadoTienda();
        res.json({ success: true, ...estado });
    } catch (error) {
        console.error('Error obteniendo estado tienda:', error);
        res.status(500).json({ success: false, message: 'Error al obtener estado de la tienda' });
    }
};

const obtenerEstadoPublico = async (req, res) => {
    return obtenerEstado(req, res);
};

const obtenerApariencia = async (req, res) => {
    try {
        const data = await brandingSettingsService.getTiendaApariencia();
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error obteniendo apariencia tienda:', error);
        res.status(500).json({ success: false, message: 'Error al obtener apariencia' });
    }
};

const actualizarApariencia = async (req, res) => {
    try {
        const { colorPrimario, colorSecundario } = req.body || {};
        const HEX_REGEX = /^#[0-9A-F]{6}$/i;

        for (const [label, value] of [
            ['colorPrimario', colorPrimario],
            ['colorSecundario', colorSecundario]
        ]) {
            if (value !== undefined && value !== null && String(value).trim()) {
                if (!HEX_REGEX.test(String(value).trim())) {
                    return res.status(400).json({
                        success: false,
                        message: `${label} debe tener formato HEX (#RRGGBB)`
                    });
                }
            }
        }

        const data = await brandingSettingsService.updateTiendaApariencia({
            colorPrimario,
            colorSecundario
        });

        res.json({
            success: true,
            message: 'Apariencia actualizada',
            data
        });
    } catch (error) {
        console.error('Error actualizando apariencia tienda:', error);
        res.status(500).json({ success: false, message: 'Error al guardar apariencia' });
    }
};

const obtenerCarousel = async (req, res) => {
    try {
        const data = await carouselSettingsService.getCarousel({ force: true });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error obteniendo carrusel tienda:', error);
        res.status(500).json({ success: false, message: 'Error al obtener carrusel' });
    }
};

const actualizarCarousel = async (req, res) => {
    try {
        const { enabled, slides } = req.body || {};
        const data = await carouselSettingsService.updateCarousel({ enabled, slides });
        res.json({
            success: true,
            message: 'Carrusel actualizado correctamente',
            data
        });
    } catch (error) {
        console.error('Error actualizando carrusel tienda:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Error al actualizar carrusel'
        });
    }
};

const subirImagenCarousel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se recibió ninguna imagen'
            });
        }

        const uploadResult = await uploadImageToFileServer(req.file.buffer, {
            mimetype: req.file.mimetype
        });

        const width = Number(req.body?.width);
        const height = Number(req.body?.height);
        const data = await carouselSettingsService.addSlide({
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            alt: req.body?.alt,
            width: Number.isFinite(width) ? width : null,
            height: Number.isFinite(height) ? height : null,
            focalX: req.body?.focalX,
            focalY: req.body?.focalY,
            zoom: req.body?.zoom
        });

        const slide = data.slides[data.slides.length - 1] || null;
        res.status(201).json({
            success: true,
            message: 'Imagen agregada al carrusel',
            data: { carousel: data, slide }
        });
    } catch (error) {
        console.error('Error subiendo imagen carrusel:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Error al subir imagen de carrusel'
        });
    }
};

const eliminarSlideCarousel = async (req, res) => {
    try {
        const { slideId } = req.params;
        if (!slideId) {
            return res.status(400).json({ success: false, message: 'slideId requerido' });
        }

        const data = await carouselSettingsService.deleteSlide(slideId);
        res.json({
            success: true,
            message: 'Slide eliminado correctamente',
            data
        });
    } catch (error) {
        console.error('Error eliminando slide carrusel:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Error al eliminar slide'
        });
    }
};

const obtenerEnvioGratis = async (req, res) => {
    try {
        const settings = await envioGratisSettingsService.getSettings();
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error obteniendo envío gratis:', error);
        res.status(500).json({ success: false, message: 'Error al obtener envío gratis' });
    }
};

const actualizarEnvioGratis = async (req, res) => {
    try {
        const { activo, montoMinimo } = req.body || {};

        if (montoMinimo !== undefined) {
            const parsed = Number.parseFloat(String(montoMinimo).replace(',', '.'));
            if (!Number.isFinite(parsed) || parsed < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'montoMinimo debe ser un número mayor o igual a 0',
                });
            }
        }

        const data = await envioGratisSettingsService.updateSettings({ activo, montoMinimo });
        res.json({
            success: true,
            message: 'Configuración de envío gratis guardada',
            data,
        });
    } catch (error) {
        console.error('Error actualizando envío gratis:', error);
        res.status(500).json({ success: false, message: 'Error al guardar envío gratis' });
    }
};

module.exports = {
    obtenerHorarios,
    actualizarHorarioDia,
    obtenerSettings,
    actualizarSettings,
    obtenerEstado,
    obtenerEstadoPublico,
    obtenerApariencia,
    actualizarApariencia,
    obtenerCarousel,
    actualizarCarousel,
    subirImagenCarousel,
    eliminarSlideCarousel,
    obtenerEnvioGratis,
    actualizarEnvioGratis,
};
