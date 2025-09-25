const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// ✅ RUTAS PÚBLICAS
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// ✅ RUTAS PRIVADAS
router.post('/logout', authMiddleware.authenticateToken, authController.logout);
router.get('/profile', authMiddleware.authenticateToken, authController.getProfile);
router.put('/change-password', authMiddleware.authenticateToken, authController.changePassword);

// ✅ RUTA DE VERIFICACIÓN DE TOKEN - CORREGIDA
router.get('/verify', authMiddleware.authenticateToken, (req, res) => {
    // Si llegó acá es porque el middleware validó el token
    try {
        // Verificar que req.user existe y tiene la estructura esperada
        if (!req.user || !req.user.id) {
            console.error('❌ req.user no válido:', req.user);
            return res.status(403).json({ 
                valid: false,
                error: 'Token structure invalid',
                message: 'Token no contiene información válida del usuario'
            });
        }

        console.log('✅ Token verificado para usuario:', req.user.usuario);
        
        res.json({ 
            valid: true,
            usuario: {
                id: req.user.id,
                nombre: req.user.nombre,
                usuario: req.user.usuario,
                rol: req.user.rol,
                email: req.user.email // Si está disponible en el token
            }
        });
    } catch (error) {
        console.error('❌ Error en verify route:', error);
        res.status(500).json({
            valid: false,
            error: 'Internal server error',
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;