const { ROLES } = require('./permissions');

const canViewLiquidaciones = (rol) => rol === ROLES.ADMIN;

const canViewValorHora = (rol) => rol === ROLES.ADMIN;

const canMutateValorHora = (rol) => rol === ROLES.ADMIN;

const canMutateEmpleado = (rol) => rol === ROLES.ADMIN;

const canViewResumenFinancieroHoy = (rol) => rol === ROLES.ADMIN;

/** Operación diaria: asistencias y movimientos (ingreso/egreso, bonos, etc.) */
const canOperateAsistenciaMovimientos = (rol) =>
  rol === ROLES.ADMIN || rol === ROLES.GERENTE;

const getEmpleadosCapabilities = (rol) => ({
  canViewLiquidaciones: canViewLiquidaciones(rol),
  canViewValorHora: canViewValorHora(rol),
  canMutateValorHora: canMutateValorHora(rol),
  canMutateEmpleado: canMutateEmpleado(rol),
  canViewResumenFinancieroHoy: canViewResumenFinancieroHoy(rol),
  canOperateAsistenciaMovimientos: canOperateAsistenciaMovimientos(rol),
});

module.exports = {
  canViewLiquidaciones,
  canViewValorHora,
  canMutateValorHora,
  canMutateEmpleado,
  canViewResumenFinancieroHoy,
  canOperateAsistenciaMovimientos,
  getEmpleadosCapabilities,
};
