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
    agregarArticulo,
    obtenerCapacidadCocina,
    forzarEstadoPedido,
    cobrarPedido,
    imprimirComanda,
    imprimirTicket
} = require('../controllers/pedidosController');

const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearPedidoSchema, 
    actualizarEstadoPedidoSchema, 
    actualizarObservacionesSchema,
    agregarArticuloSchema,
    editarPedidoCompletoSchema,
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

// Obtener capacidad de cocina
router.get('/capacidad', apiRateLimiter, authenticateToken, obtenerCapacidadCocina);

// Obtener todos los pedidos
router.get('/', apiRateLimiter, authenticateToken, obtenerPedidos);

// Obtener un pedido por ID
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerPedidoPorId);

// Actualizar pedido (edición completa: items, extras, cantidades, observaciones, estado_pago, medio_pago)
// Permite edición en vivo incluso cuando está EN_PREPARACION o LISTO
// Solo ADMIN y GERENTE pueden editar pedidos
router.put('/:id', apiRateLimiter, authenticateToken, authorizeRole(['ADMIN', 'GERENTE']), validateParams(idParamSchema), validate(editarPedidoCompletoSchema), actualizarPedido);

// Actualizar estado de pedido
router.put('/:id/estado', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarEstadoPedidoSchema), actualizarEstadoPedido);

// Forzar estado de pedido (bypass manual - solo ADMIN/GERENTE)
router.post('/:id/forzar-estado', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarEstadoPedidoSchema), forzarEstadoPedido);

// Cobrar pedido (solo en estado LISTO)
router.post('/:id/cobrar', apiRateLimiter, authenticateToken, validateParams(idParamSchema), cobrarPedido);

// Actualizar observaciones de pedido
router.put('/:id/observaciones', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(actualizarObservacionesSchema), actualizarObservaciones);

// Eliminar pedido
router.delete('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), eliminarPedido);

// Agregar artículo a pedido existente
router.post('/:id/articulos', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(agregarArticuloSchema), agregarArticulo);

// Impresión de comanda
router.get('/:id/comanda-print', apiRateLimiter, authenticateToken, validateParams(idParamSchema), imprimirComanda);

// Impresión de ticket/factura
router.get('/:id/ticket-print', apiRateLimiter, authenticateToken, validateParams(idParamSchema), imprimirTicket);

module.exports = router;

