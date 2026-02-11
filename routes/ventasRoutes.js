const express = require('express');
const router = express.Router();

const {
    // CRUD principal
    crearVenta,
    obtenerVentas,
    obtenerVentaPorId,
    anularVenta,
    
    // Auxiliares
    obtenerResumenVentas,
    obtenerMediosPago
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
 * RUTAS DE VENTAS
 * Todas las rutas requieren autenticación
 * Base: /ventas
 */

// =====================================================
// RUTAS AUXILIARES (deben ir antes de las rutas con :id)
// =====================================================

// Obtener resumen de ventas (para dashboard/reportes)
router.get('/resumen', apiRateLimiter, authenticateToken, obtenerResumenVentas);

// Obtener medios de pago disponibles (para filtros)
router.get('/medios-pago', apiRateLimiter, authenticateToken, obtenerMediosPago);

// =====================================================
// RUTAS CRUD PRINCIPALES
// =====================================================

// Listar todas las ventas (con filtros y paginación)
router.get('/', apiRateLimiter, authenticateToken, obtenerVentas);

// Crear nueva venta
router.post('/', apiRateLimiter, authenticateToken, validate(crearVentaSchema), crearVenta);

// Obtener una venta por ID (con detalle de artículos)
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerVentaPorId);

// Anular una venta
router.put('/:id/anular', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(anularVentaSchema), anularVenta);

module.exports = router;
