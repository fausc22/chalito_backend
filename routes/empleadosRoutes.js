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

const {
    readEmpleados,
    mutateEmpleadosMaster,
    writeEmpleadosLiquidaciones,
    operateEmpleadosAsistenciaMovimientos,
} = require('../middlewares/routeGuards');
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

/**
 * RUTAS DE EMPLEADOS
 * Incluye: empleados, asistencias, movimientos y liquidaciones
 * Base: /empleados
 *
 * Permisos:
 * - readEmpleados: GET (ADMIN, GERENTE)
 * - mutateEmpleadosMaster: POST/PUT/PATCH empleados (solo ADMIN)
 * - operateEmpleadosAsistenciaMovimientos: POST/PUT/DELETE asistencias y movimientos (ADMIN, GERENTE)
 * - writeEmpleadosLiquidaciones: liquidaciones (solo ADMIN)
 */

// =====================================================
// ASISTENCIAS
// =====================================================
router.get('/asistencias', apiRateLimiter, ...readEmpleados, validateQuery(filtrosAsistenciasQuerySchema), obtenerAsistencias);
router.post('/asistencias/ingreso', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validate(registrarIngresoAsistenciaSchema), registrarIngresoAsistencia);
router.post('/asistencias/egreso', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validate(registrarEgresoAsistenciaSchema), registrarEgresoAsistencia);
router.get('/asistencias/:id', apiRateLimiter, ...readEmpleados, validateParams(idParamSchema), obtenerAsistenciaPorId);
router.put('/asistencias/:id', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validateParams(idParamSchema), validate(corregirAsistenciaSchema), corregirAsistencia);

// =====================================================
// MOVIMIENTOS
// =====================================================
router.get('/movimientos', apiRateLimiter, ...readEmpleados, validateQuery(filtrosMovimientosQuerySchema), obtenerMovimientos);
router.post('/movimientos', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validate(crearMovimientoSchema), crearMovimiento);
router.get('/movimientos/:id', apiRateLimiter, ...readEmpleados, validateParams(idParamSchema), obtenerMovimientoPorId);
router.put('/movimientos/:id', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validateParams(idParamSchema), validate(editarMovimientoSchema), editarMovimiento);
router.delete('/movimientos/:id', apiRateLimiter, ...operateEmpleadosAsistenciaMovimientos, validateParams(idParamSchema), eliminarMovimiento);

// =====================================================
// LIQUIDACIONES (solo ADMIN)
// =====================================================
router.get('/liquidaciones', apiRateLimiter, ...writeEmpleadosLiquidaciones, validateQuery(filtrosLiquidacionesQuerySchema), obtenerLiquidaciones);
router.get('/liquidaciones/resumen', apiRateLimiter, ...writeEmpleadosLiquidaciones, validateQuery(resumenLiquidacionQuerySchema), obtenerResumenLiquidacion);
router.post('/liquidaciones/calcular', apiRateLimiter, ...writeEmpleadosLiquidaciones, validate(resumenLiquidacionBodySchema), calcularResumenLiquidacion);
router.get('/liquidaciones/:id', apiRateLimiter, ...writeEmpleadosLiquidaciones, validateParams(idParamSchema), obtenerLiquidacionPorId);
router.post('/liquidaciones', apiRateLimiter, ...writeEmpleadosLiquidaciones, validate(guardarLiquidacionSchema), crearLiquidacion);

// =====================================================
// EMPLEADOS (maestro)
// =====================================================
router.get('/', apiRateLimiter, ...readEmpleados, validateQuery(filtrosEmpleadosQuerySchema), obtenerEmpleados);
router.post('/', apiRateLimiter, ...mutateEmpleadosMaster, validate(crearEmpleadoSchema), crearEmpleado);
router.get('/:id', apiRateLimiter, ...readEmpleados, validateParams(idParamSchema), obtenerEmpleadoPorId);
router.put('/:id', apiRateLimiter, ...mutateEmpleadosMaster, validateParams(idParamSchema), validate(editarEmpleadoSchema), editarEmpleado);
router.patch('/:id/activo', apiRateLimiter, ...mutateEmpleadosMaster, validateParams(idParamSchema), validate(actualizarEstadoEmpleadoSchema), actualizarEstadoEmpleado);

module.exports = router;
