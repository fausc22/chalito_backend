const express = require('express');
const router = express.Router();

const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
  listarClientes,
  sugerenciasClientes,
  obtenerClientePorId,
  obtenerHistorialCliente,
  actualizarCliente,
  eliminarCliente,
} = require('../controllers/clientesController');

router.get(
  '/',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN', 'GERENTE']),
  listarClientes
);

router.get(
  '/sugerencias',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN', 'GERENTE', 'CAJERO']),
  sugerenciasClientes
);

router.get(
  '/:id',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN', 'GERENTE', 'CAJERO']),
  obtenerClientePorId
);

router.get(
  '/:id/historial',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN', 'GERENTE', 'CAJERO']),
  obtenerHistorialCliente
);

router.put(
  '/:id',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN', 'GERENTE']),
  actualizarCliente
);

router.delete(
  '/:id',
  apiRateLimiter,
  authenticateToken,
  authorizeRole(['ADMIN']),
  eliminarCliente
);

module.exports = router;
