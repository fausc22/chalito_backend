const express = require('express');
const router = express.Router();

const { getDashboardReportes } = require('../controllers/reportes.controller');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * RUTAS DE REPORTES / ESTADÍSTICAS
 * Base: /reportes
 */
router.get('/dashboard', apiRateLimiter, authenticateToken, getDashboardReportes);

module.exports = router;
