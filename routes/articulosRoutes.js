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

const { readInventario, writeInventario } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

router.post('/upload-imagen', apiRateLimiter, ...writeInventario, uploadSingle, uploadImagen);

router.get('/categorias', apiRateLimiter, ...readInventario, obtenerCategorias);
router.get('/', apiRateLimiter, ...readInventario, obtenerArticulos);
router.get('/:id', apiRateLimiter, ...readInventario, obtenerArticuloPorId);
router.get('/:id/costo', apiRateLimiter, ...readInventario, calcularCostoArticuloElaborado);

router.post('/', apiRateLimiter, ...writeInventario, crearArticulo);
router.put('/:id', apiRateLimiter, ...writeInventario, actualizarArticulo);
router.delete('/:id', apiRateLimiter, ...writeInventario, eliminarArticulo);

router.get('/:id/adicionales', apiRateLimiter, ...readInventario, obtenerAdicionalesPorArticulo);
router.post('/:id/adicionales', apiRateLimiter, ...writeInventario, asignarAdicionalesAArticulo);
router.delete('/:id/adicionales/:adicionalId', apiRateLimiter, ...writeInventario, eliminarAdicionalDeArticulo);

module.exports = router;
