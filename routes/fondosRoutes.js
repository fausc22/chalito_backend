const express = require('express');
const router = express.Router();

const {
    // Cuentas
    obtenerCuentas,
    obtenerCuentaPorId,
    crearCuenta,
    actualizarCuenta,
    eliminarCuenta,
    
    // Movimientos
    obtenerMovimientos,
    registrarMovimiento,
    obtenerHistorialUnificado
} = require('../controllers/fondosController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    crearCuentaSchema,
    editarCuentaSchema,
    registrarMovimientoSchema,
    idParamSchema,
    validate,
    validateParams
} = require('../validators/fondosValidators');

/**
 * RUTAS DE FONDOS
 * Todas las rutas requieren autenticación
 * Base: /fondos
 */

// =====================================================
// RUTAS DE CUENTAS DE FONDOS
// =====================================================

// Listar todas las cuentas
router.get('/cuentas', apiRateLimiter, authenticateToken, obtenerCuentas);

// Crear nueva cuenta
router.post('/cuentas', apiRateLimiter, authenticateToken, validate(crearCuentaSchema), crearCuenta);

// Obtener cuenta por ID
router.get('/cuentas/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerCuentaPorId);

// Actualizar cuenta
router.put('/cuentas/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(editarCuentaSchema), actualizarCuenta);

// Eliminar cuenta (soft delete)
router.delete('/cuentas/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), eliminarCuenta);

// =====================================================
// RUTAS DE MOVIMIENTOS DE FONDOS
// =====================================================

// Registrar movimiento manual (ingreso o egreso)
router.post('/movimientos', apiRateLimiter, authenticateToken, validate(registrarMovimientoSchema), registrarMovimiento);

// Obtener movimientos de una cuenta
router.get('/cuentas/:id/movimientos', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerMovimientos);

// Obtener historial unificado (ventas, gastos, movimientos)
router.get('/cuentas/:id/historial', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerHistorialUnificado);

module.exports = router;

