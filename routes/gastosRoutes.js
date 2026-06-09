const express = require('express');
const router = express.Router();

const {
    crearGasto,
    obtenerGastos,
    obtenerGastoPorId,
    editarGasto,
    eliminarGasto,
    obtenerCategoriasGastos,
    crearCategoriaGasto,
    editarCategoriaGasto,
    eliminarCategoriaGasto,
    obtenerCuentasFondos,
    obtenerResumenGastos
} = require('../controllers/gastosController');

const { readGastos, writeGastos } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    crearGastoSchema,
    editarGastoSchema,
    crearCategoriaGastoSchema,
    editarCategoriaGastoSchema,
    idParamSchema,
    validate,
    validateParams
} = require('../validators/gastosValidators');

router.get('/cuentas', apiRateLimiter, ...readGastos, obtenerCuentasFondos);
router.get('/resumen', apiRateLimiter, ...readGastos, obtenerResumenGastos);

router.get('/categorias', apiRateLimiter, ...readGastos, obtenerCategoriasGastos);
router.post('/categorias', apiRateLimiter, ...writeGastos, validate(crearCategoriaGastoSchema), crearCategoriaGasto);
router.put('/categorias/:id', apiRateLimiter, ...writeGastos, validateParams(idParamSchema), validate(editarCategoriaGastoSchema), editarCategoriaGasto);
router.delete('/categorias/:id', apiRateLimiter, ...writeGastos, validateParams(idParamSchema), eliminarCategoriaGasto);

router.get('/', apiRateLimiter, ...readGastos, obtenerGastos);
router.post('/', apiRateLimiter, ...writeGastos, validate(crearGastoSchema), crearGasto);
router.get('/:id', apiRateLimiter, ...readGastos, validateParams(idParamSchema), obtenerGastoPorId);
router.put('/:id', apiRateLimiter, ...writeGastos, validateParams(idParamSchema), validate(editarGastoSchema), editarGasto);
router.delete('/:id', apiRateLimiter, ...writeGastos, validateParams(idParamSchema), eliminarGasto);

module.exports = router;
