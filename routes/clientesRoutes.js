const express = require('express');
const router = express.Router();

const { readClientes, writeClientes, deleteClientes } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
  listarClientes,
  sugerenciasClientes,
  obtenerClientePorId,
  obtenerHistorialCliente,
  actualizarCliente,
  eliminarCliente,
} = require('../controllers/clientesController');

router.get('/', apiRateLimiter, ...readClientes, listarClientes);
router.get('/sugerencias', apiRateLimiter, ...readClientes, sugerenciasClientes);
router.get('/:id', apiRateLimiter, ...readClientes, obtenerClientePorId);
router.get('/:id/historial', apiRateLimiter, ...readClientes, obtenerHistorialCliente);
router.put('/:id', apiRateLimiter, ...writeClientes, actualizarCliente);
router.delete('/:id', apiRateLimiter, ...deleteClientes, eliminarCliente);

module.exports = router;
