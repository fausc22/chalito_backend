const express = require('express');
const router = express.Router();
const {
    crearVenta,
    obtenerVentas,
    obtenerVentaPorId,
    anularVenta
} = require('../controllers/ventasController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearVentaSchema, 
    anularVentaSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/ventasValidators');

/**
 * Rutas de ventas
 * Todas las rutas requieren autenticación y rate limiting
 */

// Crear nueva venta
router.post('/', apiRateLimiter, authenticateToken, validate(crearVentaSchema), crearVenta);

// Obtener todas las ventas
router.get('/', apiRateLimiter, authenticateToken, obtenerVentas);

// Obtener una venta por ID
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerVentaPorId);

// Anular una venta
router.put('/:id/anular', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(anularVentaSchema), anularVenta);

module.exports = router;

