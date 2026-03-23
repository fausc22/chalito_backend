const express = require('express');
const router = express.Router();
const { obtenerEstadoWorker } = require('../controllers/healthController');
const { internalRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de health check
 * 
 * NOTA: Estos endpoints NO requieren autenticación para permitir polling
 * desde el frontend sin necesidad de tokens. Se protegen con un límite interno alto.
 */

// Health check del worker (público, límite interno alto)
router.get('/worker', internalRateLimiter, obtenerEstadoWorker);

module.exports = router;


