const { MODULES } = require('../config/permissions');

/**
 * Capacidades finas del módulo empleados (complementa authorizeModule).
 * @param {(rol: string) => boolean} checkFn
 * @param {string} capabilityName
 */
const requireEmpleadosCapability = (checkFn, capabilityName) => (req, res, next) => {
  if (!req.user?.rol) {
    return res.status(401).json({
      message: 'Usuario no autenticado',
      code: 'NOT_AUTHENTICATED',
    });
  }

  if (!checkFn(req.user.rol)) {
    return res.status(403).json({
      message: 'No tienes permisos para esta acción',
      code: 'INSUFFICIENT_PERMISSION',
      userRole: req.user.rol,
      module: MODULES.EMPLEADOS,
      capability: capabilityName,
    });
  }

  next();
};

module.exports = {
  requireEmpleadosCapability,
};
