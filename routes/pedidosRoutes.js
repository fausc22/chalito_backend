const express = require('express');
const router = express.Router();
const {
    crearPedido,
    obtenerPedidos,
    obtenerPedidoPorId,
    actualizarPedido,
    actualizarEstadoPedido,
    actualizarObservaciones,
    eliminarPedido,
    agregarArticulo
} = require('../controllers/pedidosController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearPedidoSchema, 
    actualizarEstadoPedidoSchema, 
    actualizarObservacionesSchema,
    agregarArticuloSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/pedidosValidators');

/**
 * Rutas de pedidos
 * Todas las rutas requieren autenticación y rate limiting
 */

// Crear nuevo pedido
router.post('/', apiRateLimiter, authenticateToken, validate(crearPedidoSchema), crearPedido);

// Obtener todos los pedidos
router.get('/', apiRateLimiter, authenticateToken, obtenerPedidos);

// Obtener un pedido por ID
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerPedidoPorId);

// Actualizar pedido (estado_pago, medio_pago, etc.)
router.put('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), actualizarPedido);

// Actualizar estado de pedido
router.put('/:id/estado', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarEstadoPedidoSchema), actualizarEstadoPedido);

// Actualizar observaciones de pedido
router.put('/:id/observaciones', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarObservacionesSchema), actualizarObservaciones);

// Eliminar pedido
router.delete('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), eliminarPedido);

// Agregar artículo a pedido existente
router.post('/:id/articulos', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(agregarArticuloSchema), agregarArticulo);

module.exports = router;

