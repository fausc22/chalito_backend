const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    getMiPerfil,
    actualizarMiPerfil,
    cambiarMiPassword
} = require('../controllers/usuariosController');

// Perfil del usuario autenticado
router.get('/me', apiRateLimiter, authenticateToken, getMiPerfil);
router.put('/me', apiRateLimiter, authenticateToken, actualizarMiPerfil);
router.put('/me/password', apiRateLimiter, authenticateToken, cambiarMiPassword);

module.exports = router;
