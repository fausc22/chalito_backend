const express = require('express');
const router = express.Router();
const { readConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { obtenerEstadoIntegracion } = require('../controllers/mercadoPagoAdminController');

router.get('/estado', apiRateLimiter, ...readConfiguracion, obtenerEstadoIntegracion);

module.exports = router;
