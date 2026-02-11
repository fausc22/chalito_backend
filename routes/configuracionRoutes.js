const express = require('express');
const router = express.Router();
const {
    obtenerConfiguraciones,
    obtenerConfiguracion,
    actualizarConfiguracion
} = require('../controllers/configuracionController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de configuración del sistema
 * Todas requieren autenticación y solo ADMIN/GERENTE pueden modificar
 */

// Obtener todas las configuraciones
router.get('/', apiRateLimiter, authenticateToken, obtenerConfiguraciones);

// Obtener una configuración por clave
router.get('/:clave', apiRateLimiter, authenticateToken, obtenerConfiguracion);

// Actualizar una configuración (requiere rol ADMIN o GERENTE)
router.put('/:clave', apiRateLimiter, authenticateToken, (req, res, next) => {
    // Verificar que el usuario tiene permisos (ADMIN o GERENTE)
    const user = req.user;
    if (!user || (user.rol !== 'ADMIN' && user.rol !== 'GERENTE')) {
        return res.status(403).json({
            success: false,
            message: 'No tiene permisos para modificar la configuración del sistema'
        });
    }
    next();
}, actualizarConfiguracion);

module.exports = router;








