const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { loginRateLimiter, apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

// ✅ RUTAS PÚBLICAS (con rate limiting)
router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);

// ✅ RUTAS PRIVADAS
router.post('/logout', authMiddleware.authenticateToken, authController.logout);
router.get('/profile', authMiddleware.authenticateToken, authController.getProfile);
router.put('/change-password', authMiddleware.authenticateToken, authController.changePassword);

// Verificación de token con datos frescos desde BD
router.get('/verify', ...authMiddleware.authWithRevalidate, async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(403).json({
                valid: false,
                code: 'TOKEN_FORMAT_INVALID',
                message: 'Token no contiene información válida del usuario',
            });
        }

        res.json({
            valid: true,
            usuario: {
                id: req.user.id,
                nombre: req.user.nombre,
                usuario: req.user.usuario,
                rol: req.user.rol,
                email: req.user.email,
                avatar_key: req.user.avatar_key ?? null,
                activo: req.user.activo !== false,
            },
        });
    } catch (error) {
        console.error('❌ Error en verify route:', error);
        res.status(500).json({
            valid: false,
            message: 'Error interno del servidor',
        });
    }
});

module.exports = router;