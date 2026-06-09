const express = require('express');
const router = express.Router();

const {
    crearVenta,
    obtenerVentas,
    obtenerVentaPorId,
    anularVenta,
    obtenerResumenVentas,
    obtenerMediosPago,
    solicitarFacturaVenta
} = require('../controllers/ventasController');

const { readVentas, writeVentas } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearVentaSchema, 
    anularVentaSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/ventasValidators');

router.get('/resumen', apiRateLimiter, ...readVentas, obtenerResumenVentas);
router.get('/medios-pago', apiRateLimiter, ...readVentas, obtenerMediosPago);

router.get('/', apiRateLimiter, ...readVentas, obtenerVentas);
router.post('/', apiRateLimiter, ...writeVentas, validate(crearVentaSchema), crearVenta);
router.get('/:id', apiRateLimiter, ...readVentas, validateParams(idParamSchema), obtenerVentaPorId);
router.post('/:id/solicitar-factura', apiRateLimiter, ...writeVentas, validateParams(idParamSchema), solicitarFacturaVenta);
router.put('/:id/anular', apiRateLimiter, ...writeVentas, validateParams(idParamSchema), validate(anularVentaSchema), anularVenta);

module.exports = router;
