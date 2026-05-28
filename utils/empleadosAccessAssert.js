const {
  canMutateEmpleado,
  canMutateValorHora,
} = require('../config/empleadosPermissions');

const buildForbiddenError = (message, capability) => {
  const err = new Error(message);
  err.status = 403;
  err.code = 'INSUFFICIENT_PERMISSION';
  err.capability = capability;
  return err;
};

const assertCanMutateEmpleadoMaster = (rol) => {
  if (!canMutateEmpleado(rol)) {
    throw buildForbiddenError(
      'No tienes permisos para crear o modificar empleados',
      'mutar_empleado'
    );
  }
};

const assertCanMutateValorHora = (rol) => {
  if (!canMutateValorHora(rol)) {
    throw buildForbiddenError(
      'No tienes permisos para modificar el valor hora',
      'mutar_valor_hora'
    );
  }
};

module.exports = {
  assertCanMutateEmpleadoMaster,
  assertCanMutateValorHora,
  buildForbiddenError,
};
