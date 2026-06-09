const express = require('express');
const router = express.Router();
const {
  authenticateToken,
  revalidateUser,
  requireAdminModule,
  authWithRevalidate,
  authorizeModule,
} = require('../middlewares/authMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
  getMiPerfil,
  actualizarMiPerfil,
  cambiarMiPassword,
} = require('../controllers/usuariosController');
const {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  patchActivoUsuario,
  resetPasswordUsuario,
} = require('../controllers/usuariosAdminController');
const {
  crearUsuarioSchema,
  editarUsuarioSchema,
  patchActivoSchema,
  resetPasswordSchema,
  idParamSchema,
  listQuerySchema,
  validate,
  validateParams,
  validateQuery,
} = require('../validators/usuariosValidators');
const { MODULES } = require('../config/permissions');

const adminOnly = requireAdminModule;
const perfilAuth = [...authWithRevalidate, authorizeModule(MODULES.PERFIL, 'read')];
const perfilWrite = [...authWithRevalidate, authorizeModule(MODULES.PERFIL, 'write')];

// --- Admin (solo ADMIN) — rutas antes de /:id ---
router.get(
  '/',
  apiRateLimiter,
  ...adminOnly,
  validateQuery(listQuerySchema),
  listarUsuarios
);

router.post('/', apiRateLimiter, ...adminOnly, validate(crearUsuarioSchema), crearUsuario);

// --- Perfil propio ---
router.get('/me', apiRateLimiter, ...perfilAuth, getMiPerfil);
router.put('/me', apiRateLimiter, ...perfilWrite, actualizarMiPerfil);
router.put('/me/password', apiRateLimiter, ...perfilWrite, cambiarMiPassword);

// --- Admin por id ---
router.get(
  '/:id',
  apiRateLimiter,
  ...adminOnly,
  validateParams(idParamSchema),
  obtenerUsuario
);

router.put(
  '/:id',
  apiRateLimiter,
  ...adminOnly,
  validateParams(idParamSchema),
  validate(editarUsuarioSchema),
  actualizarUsuario
);

router.patch(
  '/:id/activo',
  apiRateLimiter,
  ...adminOnly,
  validateParams(idParamSchema),
  validate(patchActivoSchema),
  patchActivoUsuario
);

router.put(
  '/:id/password',
  apiRateLimiter,
  ...adminOnly,
  validateParams(idParamSchema),
  validate(resetPasswordSchema),
  resetPasswordUsuario
);

module.exports = router;
