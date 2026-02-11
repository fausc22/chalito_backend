const express = require('express');
const router = express.Router();
const {
    crearComanda,
    obtenerComandas,
    obtenerComandaPorId,
    actualizarObservaciones
} = require('../controllers/comandasController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearComandaSchema, 
    actualizarObservacionesComandaSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/comandasValidators');

/**
 * Rutas de comandas
 * Todas las rutas requieren autenticación y rate limiting
 */

// Crear nueva comanda
router.post('/', apiRateLimiter, authenticateToken, validate(crearComandaSchema), crearComanda);

// Obtener todas las comandas
router.get('/', apiRateLimiter, authenticateToken, obtenerComandas);

// Obtener una comanda por ID
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerComandaPorId);

// Actualizar observaciones de comanda
// NOTA: No existe ruta para actualizar estado de comanda porque la comanda no maneja estado propio.
// El estado se deriva exclusivamente de pedidos.estado
router.put('/:id/observaciones', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarObservacionesComandaSchema), actualizarObservaciones);

module.exports = router;

