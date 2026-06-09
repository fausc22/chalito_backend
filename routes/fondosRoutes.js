const express = require('express');
const router = express.Router();

const {
    obtenerCuentas,
    obtenerCuentaPorId,
    crearCuenta,
    actualizarCuenta,
    eliminarCuenta,
    obtenerMovimientos,
    registrarMovimiento,
    obtenerHistorialUnificado
} = require('../controllers/fondosController');

const { readFondos, writeFondos } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    crearCuentaSchema,
    editarCuentaSchema,
    registrarMovimientoSchema,
    idParamSchema,
    validate,
    validateParams
} = require('../validators/fondosValidators');

router.get('/cuentas', apiRateLimiter, ...readFondos, obtenerCuentas);
router.post('/cuentas', apiRateLimiter, ...writeFondos, validate(crearCuentaSchema), crearCuenta);
router.get('/cuentas/:id', apiRateLimiter, ...readFondos, validateParams(idParamSchema), obtenerCuentaPorId);
router.put('/cuentas/:id', apiRateLimiter, ...writeFondos, validateParams(idParamSchema), validate(editarCuentaSchema), actualizarCuenta);
router.delete('/cuentas/:id', apiRateLimiter, ...writeFondos, validateParams(idParamSchema), eliminarCuenta);

router.post('/movimientos', apiRateLimiter, ...writeFondos, validate(registrarMovimientoSchema), registrarMovimiento);
router.get('/cuentas/:id/movimientos', apiRateLimiter, ...readFondos, validateParams(idParamSchema), obtenerMovimientos);
router.get('/cuentas/:id/historial', apiRateLimiter, ...readFondos, validateParams(idParamSchema), obtenerHistorialUnificado);

module.exports = router;
