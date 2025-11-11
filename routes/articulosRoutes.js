const express = require('express');
const router = express.Router();
const {
    obtenerArticulos,
    obtenerArticuloPorId,
    obtenerCategorias,
    crearArticulo,
    actualizarArticulo,
    eliminarArticulo
} = require('../controllers/articulosController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de artículos
 * Todas las rutas requieren autenticación y rate limiting
 */

// Obtener categorías (debe ir antes de /:id para evitar conflictos)
router.get('/categorias', apiRateLimiter, authenticateToken, obtenerCategorias);

// Obtener todos los artículos con filtros opcionales
router.get('/', apiRateLimiter, authenticateToken, obtenerArticulos);

// Obtener un artículo por ID
router.get('/:id', apiRateLimiter, authenticateToken, obtenerArticuloPorId);

// Crear nuevo artículo
router.post('/', apiRateLimiter, authenticateToken, crearArticulo);

// Actualizar artículo existente
router.put('/:id', apiRateLimiter, authenticateToken, actualizarArticulo);

// Eliminar artículo (soft delete)
router.delete('/:id', apiRateLimiter, authenticateToken, eliminarArticulo);

module.exports = router;
