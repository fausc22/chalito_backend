const express = require('express');
const router = express.Router();
const {
    obtenerConfiguraciones,
    obtenerConfiguracion,
    actualizarConfiguracion,
    actualizarConfiguracionOperativa
} = require('../controllers/configuracionController');

const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

router.get('/', apiRateLimiter, ...readConfiguracion, obtenerConfiguraciones);
router.put('/', apiRateLimiter, ...writeConfiguracion, actualizarConfiguracionOperativa);
router.get('/:clave', apiRateLimiter, ...readConfiguracion, obtenerConfiguracion);
router.put('/:clave', apiRateLimiter, ...writeConfiguracion, actualizarConfiguracion);

module.exports = router;
