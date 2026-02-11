const express = require('express');
const router = express.Router();

const {
    // Gastos
    crearGasto,
    obtenerGastos,
    obtenerGastoPorId,
    editarGasto,
    eliminarGasto,
    
    // Categorías de Gastos
    obtenerCategoriasGastos,
    crearCategoriaGasto,
    editarCategoriaGasto,
    eliminarCategoriaGasto,
    
    // Auxiliares
    obtenerCuentasFondos,
    obtenerResumenGastos
} = require('../controllers/gastosController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
    crearGastoSchema,
    editarGastoSchema,
    crearCategoriaGastoSchema,
    editarCategoriaGastoSchema,
    idParamSchema,
    validate,
    validateParams
} = require('../validators/gastosValidators');

/**
 * RUTAS DE GASTOS
 * Todas las rutas requieren autenticación
 * Base: /gastos
 */

// =====================================================
// RUTAS AUXILIARES (deben ir antes de las rutas con :id)
// =====================================================

// Obtener cuentas de fondos disponibles
router.get('/cuentas', apiRateLimiter, authenticateToken, obtenerCuentasFondos);

// Obtener resumen de gastos
router.get('/resumen', apiRateLimiter, authenticateToken, obtenerResumenGastos);

// =====================================================
// RUTAS DE CATEGORÍAS DE GASTOS
// =====================================================

// Listar categorías de gastos
router.get('/categorias', apiRateLimiter, authenticateToken, obtenerCategoriasGastos);

// Crear categoría de gasto
router.post('/categorias', apiRateLimiter, authenticateToken, validate(crearCategoriaGastoSchema), crearCategoriaGasto);

// Editar categoría de gasto
router.put('/categorias/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(editarCategoriaGastoSchema), editarCategoriaGasto);

// Eliminar/Desactivar categoría de gasto
router.delete('/categorias/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), eliminarCategoriaGasto);

// =====================================================
// RUTAS CRUD DE GASTOS
// =====================================================

// Listar todos los gastos (con filtros)
router.get('/', apiRateLimiter, authenticateToken, obtenerGastos);

// Crear nuevo gasto
router.post('/', apiRateLimiter, authenticateToken, validate(crearGastoSchema), crearGasto);

// Obtener gasto por ID
router.get('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), obtenerGastoPorId);

// Editar gasto
router.put('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), validate(editarGastoSchema), editarGasto);

// Eliminar gasto
router.delete('/:id', apiRateLimiter, authenticateToken, validateParams(idParamSchema), eliminarGasto);

module.exports = router;

