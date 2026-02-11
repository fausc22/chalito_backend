const express = require('express');
const router = express.Router();
const { obtenerMetricasPedidosAtrasados } = require('../controllers/metricsController');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de métricas
 * 
 * NOTA: Estos endpoints NO requieren autenticación para permitir polling
 * desde el frontend sin necesidad de tokens. Se protegen con rate limiting.
 * Las métricas expuestas son no sensibles (estado del sistema, pedidos atrasados).
 */

// Métricas de pedidos atrasados (público, con rate limiting)
router.get('/pedidos-atrasados', apiRateLimiter, obtenerMetricasPedidosAtrasados);

module.exports = router;


