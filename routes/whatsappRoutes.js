const express = require('express');
const router = express.Router();
const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    whatsappEstado,
    whatsappQr,
    whatsappConectar,
    whatsappDesconectar,
    obtenerSettings,
    actualizarSettings,
    obtenerPreviews
} = require('../controllers/whatsappController');

router.get('/estado', apiRateLimiter, ...readConfiguracion, whatsappEstado);
router.get('/qr', apiRateLimiter, ...readConfiguracion, whatsappQr);
router.post('/conectar', apiRateLimiter, ...writeConfiguracion, whatsappConectar);
router.post('/desconectar', apiRateLimiter, ...writeConfiguracion, whatsappDesconectar);
router.get('/settings', apiRateLimiter, ...readConfiguracion, obtenerSettings);
router.get('/previews', apiRateLimiter, ...readConfiguracion, obtenerPreviews);
router.put('/settings', apiRateLimiter, ...writeConfiguracion, actualizarSettings);

module.exports = router;
