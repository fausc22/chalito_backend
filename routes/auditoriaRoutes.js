const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoriaController');
const { readAuditoria } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

router.get('/test-simple', apiRateLimiter, ...readAuditoria, auditoriaController.obtenerAuditoriaSimple);

router.get('/', apiRateLimiter, ...readAuditoria, auditoriaController.obtenerAuditoria);
router.get('/detalle/:id', apiRateLimiter, ...readAuditoria, auditoriaController.obtenerDetalleAuditoria);
router.get('/datos-filtros', apiRateLimiter, ...readAuditoria, auditoriaController.obtenerDatosFiltros);
router.get('/estadisticas', apiRateLimiter, ...readAuditoria, auditoriaController.obtenerEstadisticasSimples);

if (process.env.NODE_ENV === 'development') {
    router.get('/debug', apiRateLimiter, ...readAuditoria, async (req, res) => {
            try {
                const dbStatus = require('../controllers/dbPromise').getStatus();
                const poolStats = await require('../controllers/dbPromise').getPoolStats();
                
                res.json({
                    success: true,
                    message: 'Debug de auditoría',
                    user: req.user,
                    database: {
                        status: dbStatus,
                        poolStats: poolStats
                    },
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Error en debug',
                    error: error.message
                });
            }
        }
    );
}

module.exports = router;
