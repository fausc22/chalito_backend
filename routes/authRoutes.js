const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// ✅ RUTAS PÚBLICAS
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);


//RUTAS PRIVADAS
router.post('/logout', authMiddleware.authenticateToken, authController.logout);
router.get('/profile', authMiddleware.authenticateToken, authController.getProfile);
router.put('/change-password', authMiddleware.authenticateToken, authController.changePassword);

// ✅ RUTA DE VERIFICACIÓN DE TOKEN
router.get('/verify', (req, res) => {
    // Si llegó acá es porque el middleware validó el token
    res.json({ 
        valid: true,
        usuario: {
            id: req.user.id,
            nombre: req.user.nombre,
            usuario: req.user.usuario,
            rol: req.user.rol
        }
    });
});

module.exports = router;