const express = require('express');
const router = express.Router();
const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    listarCupones,
    crearCupon,
    actualizarCupon,
    toggleActivo
} = require('../controllers/cuponesController');

router.get('/', apiRateLimiter, ...readConfiguracion, listarCupones);
router.post('/', apiRateLimiter, ...writeConfiguracion, crearCupon);
router.put('/:id', apiRateLimiter, ...writeConfiguracion, actualizarCupon);
router.put('/:id/toggle', apiRateLimiter, ...writeConfiguracion, toggleActivo);

module.exports = router;
