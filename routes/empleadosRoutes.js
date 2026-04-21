const express = require('express');
const router = express.Router();

const {
    obtenerEmpleados,
    obtenerEmpleadoPorId,
    crearEmpleado,
    editarEmpleado,
    actualizarEstadoEmpleado,
    obtenerAsistencias,
    obtenerAsistenciaPorId,
    registrarIngresoAsistencia,
    registrarEgresoAsistencia,
    corregirAsistencia,
    obtenerMovimientos,
    obtenerMovimientoPorId,
    crearMovimiento,
    editarMovimiento,
    eliminarMovimiento,
    obtenerResumenLiquidacion,
    calcularResumenLiquidacion,
    obtenerLiquidaciones,
    obtenerLiquidacionPorId,
    crearLiquidacion
} = require('../controllers/empleadosController');

const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    crearEmpleadoSchema,
    editarEmpleadoSchema,
    actualizarEstadoEmpleadoSchema,
    registrarIngresoAsistenciaSchema,
    registrarEgresoAsistenciaSchema,
    corregirAsistenciaSchema,
    crearMovimientoSchema,
    editarMovimientoSchema,
    guardarLiquidacionSchema,
    idParamSchema,
    filtrosEmpleadosQuerySchema,
    filtrosAsistenciasQuerySchema,
    filtrosMovimientosQuerySchema,
    filtrosLiquidacionesQuerySchema,
    resumenLiquidacionQuerySchema,
    resumenLiquidacionBodySchema,
    validate,
    validateParams,
    validateQuery
} = require('../validators/empleadosValidators');

const soloDuenioEncargadoAdmin = [authenticateToken, authorizeRole(['ADMIN', 'GERENTE'])];

/**
 * RUTAS DE EMPLEADOS
 * Incluye: empleados, asistencias, movimientos y liquidaciones
 * Base: /empleados
 *
 * Endpoints principales (base /empleados):
 * - Empleados: GET /, GET /:id, POST /, PUT /:id, PATCH /:id/activo
 * - Asistencias: GET /asistencias, GET /asistencias/:id, POST /asistencias/ingreso, POST /asistencias/egreso, PUT /asistencias/:id
 * - Movimientos: GET /movimientos, GET /movimientos/:id, POST /movimientos, PUT /movimientos/:id, DELETE /movimientos/:id
 * - Liquidaciones: GET /liquidaciones/resumen (canonica), POST /liquidaciones/calcular (compatibilidad frontend), GET /liquidaciones, GET /liquidaciones/:id, POST /liquidaciones
 */

// =====================================================
// ASISTENCIAS
// =====================================================
router.get('/asistencias', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateQuery(filtrosAsistenciasQuerySchema), obtenerAsistencias);
router.post('/asistencias/ingreso', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(registrarIngresoAsistenciaSchema), registrarIngresoAsistencia);
router.post('/asistencias/egreso', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(registrarEgresoAsistenciaSchema), registrarEgresoAsistencia);
router.get('/asistencias/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), obtenerAsistenciaPorId);
router.put('/asistencias/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), validate(corregirAsistenciaSchema), corregirAsistencia);

// =====================================================
// MOVIMIENTOS
// =====================================================
router.get('/movimientos', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateQuery(filtrosMovimientosQuerySchema), obtenerMovimientos);
router.post('/movimientos', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(crearMovimientoSchema), crearMovimiento);
router.get('/movimientos/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), obtenerMovimientoPorId);
router.put('/movimientos/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), validate(editarMovimientoSchema), editarMovimiento);
router.delete('/movimientos/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), eliminarMovimiento);

// =====================================================
// LIQUIDACIONES
// =====================================================
router.get('/liquidaciones', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateQuery(filtrosLiquidacionesQuerySchema), obtenerLiquidaciones);
router.get('/liquidaciones/resumen', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateQuery(resumenLiquidacionQuerySchema), obtenerResumenLiquidacion);
router.post('/liquidaciones/calcular', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(resumenLiquidacionBodySchema), calcularResumenLiquidacion);
router.get('/liquidaciones/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), obtenerLiquidacionPorId);
router.post('/liquidaciones', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(guardarLiquidacionSchema), crearLiquidacion);

// =====================================================
// EMPLEADOS
// =====================================================
router.get('/', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateQuery(filtrosEmpleadosQuerySchema), obtenerEmpleados);
router.post('/', apiRateLimiter, ...soloDuenioEncargadoAdmin, validate(crearEmpleadoSchema), crearEmpleado);
router.get('/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), obtenerEmpleadoPorId);
router.put('/:id', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), validate(editarEmpleadoSchema), editarEmpleado);
router.patch('/:id/activo', apiRateLimiter, ...soloDuenioEncargadoAdmin, validateParams(idParamSchema), validate(actualizarEstadoEmpleadoSchema), actualizarEstadoEmpleado);

module.exports = router;
