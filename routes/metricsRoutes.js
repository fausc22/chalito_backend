const express = require('express');
const router = express.Router();
const { obtenerMetricasPedidosAtrasados } = require('../controllers/metricsController');
const { internalRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de métricas
 * 
 * NOTA: Estos endpoints NO requieren autenticación para permitir polling
 * desde el frontend sin necesidad de tokens. Se protegen con un límite interno alto.
 * Las métricas expuestas son no sensibles (estado del sistema, pedidos atrasados).
 */

// Métricas de pedidos atrasados (público, límite interno alto)
router.get('/pedidos-atrasados', internalRateLimiter, obtenerMetricasPedidosAtrasados);

module.exports = router;


