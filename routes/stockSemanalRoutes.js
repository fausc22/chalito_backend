const express = require('express');

const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { middlewareAuditoria } = require('../middlewares/auditoriaMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const stockSemanalController = require('../controllers/stockSemanalController');
const {
    idParamSchema,
    listarInsumosQuerySchema,
    crearInsumoSchema,
    editarInsumoSchema,
    patchActivoInsumoSchema,
    crearSemanaSchema,
    historicoSemanasQuerySchema,
    stockInicialBodySchema,
    stockFinalBodySchema,
    validate,
    validateParams,
    validateQuery
} = require('../validators/stockSemanalValidators');

const soloAdminGerente = [authenticateToken, authorizeRole(['ADMIN', 'GERENTE'])];

/**
 * Stock semanal — montado bajo app.use('/inventario', inventarioRoutes).
 * Base real: /inventario/stock-semanal/...
 *
 * | Metodo | Ruta |
 * | GET    | /stock-semanal/insumos |
 * | POST   | /stock-semanal/insumos |
 * | PUT    | /stock-semanal/insumos/:id |
 * | PATCH  | /stock-semanal/insumos/:id/activo |
 * | DELETE | /stock-semanal/insumos/:id |
 * | GET    | /stock-semanal/semanas/abierta |
 * | GET    | /stock-semanal/semanas |
 * | POST   | /stock-semanal/semanas |
 * | POST   | /stock-semanal/semanas/:id/cerrar |
 * | PATCH  | /stock-semanal/semanas/:id/cerrar |
 * | GET    | /stock-semanal/semanas/:id |
 * | PUT    | /stock-semanal/detalles/:id/stock-inicial |
 * | PUT    | /stock-semanal/detalles/:id/stock-final |
 */

router.get(
    '/stock-semanal/insumos',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'VIEW_STOCK_SEMANAL_INSUMOS', tabla: 'insumos_semanales', incluirQuery: true }),
    validateQuery(listarInsumosQuerySchema),
    stockSemanalController.listarInsumos
);

router.post(
    '/stock-semanal/insumos',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'CREATE_STOCK_SEMANAL_INSUMO', tabla: 'insumos_semanales', incluirBody: true }),
    validate(crearInsumoSchema),
    stockSemanalController.crearInsumo
);

router.put(
    '/stock-semanal/insumos/:id',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'UPDATE_STOCK_SEMANAL_INSUMO', tabla: 'insumos_semanales', incluirBody: true }),
    validateParams(idParamSchema),
    validate(editarInsumoSchema),
    stockSemanalController.editarInsumo
);

router.patch(
    '/stock-semanal/insumos/:id/activo',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'PATCH_STOCK_SEMANAL_INSUMO_ACTIVO', tabla: 'insumos_semanales', incluirBody: true }),
    validateParams(idParamSchema),
    validate(patchActivoInsumoSchema),
    stockSemanalController.patchActivoInsumo
);

router.delete(
    '/stock-semanal/insumos/:id',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'DELETE_STOCK_SEMANAL_INSUMO', tabla: 'insumos_semanales' }),
    validateParams(idParamSchema),
    stockSemanalController.eliminarInsumo
);

router.get(
    '/stock-semanal/semanas/abierta',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'VIEW_STOCK_SEMANAL_SEMANA_ABIERTA', tabla: 'semanas_stock' }),
    stockSemanalController.obtenerSemanaAbierta
);

router.get(
    '/stock-semanal/semanas',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'VIEW_STOCK_SEMANAL_SEMANAS', tabla: 'semanas_stock', incluirQuery: true }),
    validateQuery(historicoSemanasQuerySchema),
    stockSemanalController.historicoSemanas
);

router.post(
    '/stock-semanal/semanas',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'CREATE_STOCK_SEMANAL_SEMANA', tabla: 'semanas_stock', incluirBody: true }),
    validate(crearSemanaSchema),
    stockSemanalController.crearSemana
);

const cerrarSemanaHandlers = [
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'CERRAR_STOCK_SEMANAL_SEMANA', tabla: 'semanas_stock' }),
    validateParams(idParamSchema),
    stockSemanalController.cerrarSemana
];

router.post('/stock-semanal/semanas/:id/cerrar', ...cerrarSemanaHandlers);
router.patch('/stock-semanal/semanas/:id/cerrar', ...cerrarSemanaHandlers);

router.get(
    '/stock-semanal/semanas/:id',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({ accion: 'VIEW_STOCK_SEMANAL_SEMANA', tabla: 'semanas_stock' }),
    validateParams(idParamSchema),
    stockSemanalController.obtenerSemanaPorId
);

router.put(
    '/stock-semanal/detalles/:id/stock-inicial',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'UPDATE_STOCK_SEMANAL_DETALLE_INICIAL',
        tabla: 'semanas_stock_detalle',
        incluirBody: true
    }),
    validateParams(idParamSchema),
    validate(stockInicialBodySchema),
    stockSemanalController.actualizarStockInicial
);

router.put(
    '/stock-semanal/detalles/:id/stock-final',
    apiRateLimiter,
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'UPDATE_STOCK_SEMANAL_DETALLE_FINAL',
        tabla: 'semanas_stock_detalle',
        incluirBody: true
    }),
    validateParams(idParamSchema),
    validate(stockFinalBodySchema),
    stockSemanalController.actualizarStockFinal
);

module.exports = router;
