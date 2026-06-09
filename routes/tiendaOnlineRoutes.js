const express = require('express');
const router = express.Router();
const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    obtenerHorarios,
    actualizarHorarioDia,
    obtenerSettings,
    actualizarSettings,
    obtenerEstado,
    obtenerApariencia,
    actualizarApariencia
} = require('../controllers/tiendaOnlineController');

router.get('/horarios', apiRateLimiter, ...readConfiguracion, obtenerHorarios);
router.put('/horarios/dia', apiRateLimiter, ...writeConfiguracion, actualizarHorarioDia);
router.get('/settings', apiRateLimiter, ...readConfiguracion, obtenerSettings);
router.put('/settings', apiRateLimiter, ...writeConfiguracion, actualizarSettings);
router.get('/estado', apiRateLimiter, ...readConfiguracion, obtenerEstado);
router.get('/apariencia', apiRateLimiter, ...readConfiguracion, obtenerApariencia);
router.put('/apariencia', apiRateLimiter, ...writeConfiguracion, actualizarApariencia);

module.exports = router;
