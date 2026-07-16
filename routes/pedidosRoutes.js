const express = require('express');
const router = express.Router();
const {
    crearPedido,
    obtenerPedidos,
    obtenerPedidosEntregados,
    obtenerPedidoPorId,
    actualizarPedido,
    actualizarEstadoPedido,
    actualizarObservaciones,
    actualizarHorarioEntrega,
    eliminarPedido,
    agregarArticulo,
    obtenerCapacidadCocina,
    forzarEstadoPedido,
    iniciarPreparacionManual,
    cobrarPedido,
    imprimirComanda,
    registrarComandaImpresa,
    imprimirTicket
} = require('../controllers/pedidosController');

const { readPedidos, writePedidos, pedidosEstado } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { 
    crearPedidoSchema, 
    actualizarEstadoPedidoSchema, 
    actualizarObservacionesSchema,
    actualizarHorarioEntregaSchema,
    agregarArticuloSchema,
    editarPedidoCompletoSchema,
    cobrarPedidoSchema,
    registrarComandaImpresaSchema,
    validate,
    validateParams,
    idParamSchema
} = require('../validators/pedidosValidators');

router.post('/', apiRateLimiter, ...writePedidos, validate(crearPedidoSchema), crearPedido);
router.get('/capacidad', apiRateLimiter, ...readPedidos, obtenerCapacidadCocina);
router.get('/', apiRateLimiter, ...readPedidos, obtenerPedidos);
router.get('/entregados', apiRateLimiter, ...readPedidos, obtenerPedidosEntregados);
router.get('/:id', apiRateLimiter, ...readPedidos, validateParams(idParamSchema), obtenerPedidoPorId);

router.put('/:id', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(editarPedidoCompletoSchema), actualizarPedido);
router.put('/:id/estado', apiRateLimiter, ...pedidosEstado, validateParams(idParamSchema), validate(actualizarEstadoPedidoSchema), actualizarEstadoPedido);
router.post('/:id/forzar-estado', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(actualizarEstadoPedidoSchema), forzarEstadoPedido);
router.post('/:id/iniciar-preparacion-manual', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), iniciarPreparacionManual);
router.post('/:id/cobrar', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(cobrarPedidoSchema), cobrarPedido);
router.put('/:id/observaciones', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(actualizarObservacionesSchema), actualizarObservaciones);
router.put('/:id/horario-entrega', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(actualizarHorarioEntregaSchema), actualizarHorarioEntrega);
router.delete('/:id', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), eliminarPedido);
router.post('/:id/articulos', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(agregarArticuloSchema), agregarArticulo);
router.get('/:id/comanda-print', apiRateLimiter, ...readPedidos, validateParams(idParamSchema), imprimirComanda);
router.post('/:id/comanda-impresa', apiRateLimiter, ...writePedidos, validateParams(idParamSchema), validate(registrarComandaImpresaSchema), registrarComandaImpresa);
router.get('/:id/ticket-print', apiRateLimiter, ...readPedidos, validateParams(idParamSchema), imprimirTicket);

module.exports = router;
