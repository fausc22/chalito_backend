const { canMutateValorHora } = require('../config/empleadosPermissions');
const { assertCanMutateValorHora } = require('./empleadosAccessAssert');

/**
 * Valida y prepara payload de alta/edición de empleado según rol.
 * Defensa en profundidad (las rutas ya restringen mutaciones a ADMIN).
 */
const prepareEmpleadoMasterPayload = (payload, rol) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (canMutateValorHora(rol)) {
    return payload;
  }

  if (payload.valor_hora !== undefined && payload.valor_hora !== null) {
    assertCanMutateValorHora(rol);
  }

  const { valor_hora: _omitido, ...rest } = payload;
  return rest;
};

module.exports = {
  prepareEmpleadoMasterPayload,
};
