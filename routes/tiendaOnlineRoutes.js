const express = require('express');
const router = express.Router();
const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { uploadSingleImage } = require('../middlewares/uploadImageMiddleware');
const {
    obtenerHorarios,
    actualizarHorarioDia,
    obtenerSettings,
    actualizarSettings,
    obtenerEstado,
    obtenerApariencia,
    actualizarApariencia,
    obtenerCarousel,
    actualizarCarousel,
    subirImagenCarousel,
    eliminarSlideCarousel
} = require('../controllers/tiendaOnlineController');

router.get('/horarios', apiRateLimiter, ...readConfiguracion, obtenerHorarios);
router.put('/horarios/dia', apiRateLimiter, ...writeConfiguracion, actualizarHorarioDia);
router.get('/settings', apiRateLimiter, ...readConfiguracion, obtenerSettings);
router.put('/settings', apiRateLimiter, ...writeConfiguracion, actualizarSettings);
router.get('/estado', apiRateLimiter, ...readConfiguracion, obtenerEstado);
router.get('/apariencia', apiRateLimiter, ...readConfiguracion, obtenerApariencia);
router.put('/apariencia', apiRateLimiter, ...writeConfiguracion, actualizarApariencia);
router.get('/carousel', apiRateLimiter, ...readConfiguracion, obtenerCarousel);
router.put('/carousel', apiRateLimiter, ...writeConfiguracion, actualizarCarousel);
router.post('/carousel/upload', apiRateLimiter, ...writeConfiguracion, uploadSingleImage, subirImagenCarousel);
router.delete('/carousel/:slideId', apiRateLimiter, ...writeConfiguracion, eliminarSlideCarousel);

module.exports = router;
