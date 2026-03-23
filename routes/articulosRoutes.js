const express = require('express');
const router = express.Router();
const {
    obtenerArticulos,
    obtenerArticuloPorId,
    obtenerCategorias,
    crearArticulo,
    actualizarArticulo,
    eliminarArticulo,
    obtenerAdicionalesPorArticulo,
    asignarAdicionalesAArticulo,
    eliminarAdicionalDeArticulo,
    uploadImagen,
    uploadSingle,
    calcularCostoArticuloElaborado
} = require('../controllers/articulosController');

const { authenticateToken } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

/**
 * Rutas de artículos
 * Todas las rutas requieren autenticación y rate limiting
 */

// =====================================================
// ENDPOINT DE SUBIDA DE IMÁGENES
// =====================================================

/**
 * POST /articulos/upload-imagen
 * Sube una imagen a Cloudinary y retorna la URL
 * Body: multipart/form-data con campo 'imagen'
 * Respuesta: { imagen_url, public_id }
 */
router.post('/upload-imagen', apiRateLimiter, authenticateToken, uploadSingle, uploadImagen);

// =====================================================
// ENDPOINTS ESTÁNDAR DE ARTÍCULOS
// =====================================================

// Obtener categorías (debe ir antes de /:id para evitar conflictos)
router.get('/categorias', apiRateLimiter, authenticateToken, obtenerCategorias);

// Obtener todos los artículos con filtros opcionales
router.get('/', apiRateLimiter, authenticateToken, obtenerArticulos);

// Obtener un artículo por ID
router.get('/:id', apiRateLimiter, authenticateToken, obtenerArticuloPorId);

// Calcular costo interno de un artículo elaborado
router.get('/:id/costo', apiRateLimiter, authenticateToken, calcularCostoArticuloElaborado);

// Crear nuevo artículo
router.post('/', apiRateLimiter, authenticateToken, crearArticulo);

// Actualizar artículo existente
router.put('/:id', apiRateLimiter, authenticateToken, actualizarArticulo);

// Eliminar artículo (soft delete)
router.delete('/:id', apiRateLimiter, authenticateToken, eliminarArticulo);

// Adicionales vinculados a artículo
router.get('/:id/adicionales', apiRateLimiter, authenticateToken, obtenerAdicionalesPorArticulo);
router.post('/:id/adicionales', apiRateLimiter, authenticateToken, asignarAdicionalesAArticulo);
router.delete('/:id/adicionales/:adicionalId', apiRateLimiter, authenticateToken, eliminarAdicionalDeArticulo);

module.exports = router;
