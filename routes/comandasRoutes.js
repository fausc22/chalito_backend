const express = require('express');
const router = express.Router();
const {
    crearComanda,
    obtenerComandas,
    obtenerComandaPorId,
    actualizarObservaciones
} = require('../controllers/comandasController');

const { readPedidos, writePedidos } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearComandaSchema, 
    actualizarObservacionesComandaSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/comandasValidators');

router.post('/', apiRateLimiter, ...writePedidos, validate(crearComandaSchema), crearComanda);
router.get('/', apiRateLimiter, ...readPedidos, obtenerComandas);
router.get('/:id', apiRateLimiter, ...readPedidos, validateParams(idParamSchema), obtenerComandaPorId);
router.put('/:id/observaciones', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(actualizarObservacionesComandaSchema), actualizarObservaciones);

module.exports = router;
