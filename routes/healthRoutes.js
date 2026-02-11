const express = require('express');
const router = express.Router();
const { obtenerEstadoWorker } = require('../controllers/healthController');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de health check
 * 
 * NOTA: Estos endpoints NO requieren autenticación para permitir polling
 * desde el frontend sin necesidad de tokens. Se protegen con rate limiting.
 */

// Health check del worker (público, con rate limiting)
router.get('/worker', apiRateLimiter, obtenerEstadoWorker);

module.exports = router;


