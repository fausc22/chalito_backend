const {
  canViewValorHora,
  canViewLiquidaciones,
} = require('../config/empleadosPermissions');

const CAMPOS_LIQUIDACION_SENSIBLES = [
  'valor_hora',
  'total_base',
  'total_bonos',
  'total_descuentos',
  'total_adelantos',
  'total_consumos',
  'total_final',
  'total_horas',
  'total_minutos',
];

const omitirCampos = (obj, campos) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  const resultado = { ...obj };
  campos.forEach((campo) => {
    delete resultado[campo];
  });
  return resultado;
};

const coerceActivoBoolean = (empleado) => {
  if (!empleado || typeof empleado !== 'object' || empleado.activo === undefined) {
    return empleado;
  }

  return {
    ...empleado,
    activo: Boolean(Number(empleado.activo)),
  };
};

const sanitizeEmpleado = (empleado, rol) => {
  if (!empleado) {
    return empleado;
  }

  const withActivo = coerceActivoBoolean(empleado);

  if (canViewValorHora(rol)) {
    return withActivo;
  }

  return omitirCampos(withActivo, ['valor_hora']);
};

const sanitizeEmpleadosList = (empleados, rol) => {
  if (!Array.isArray(empleados)) {
    return empleados;
  }
  return empleados.map((row) => sanitizeEmpleado(row, rol));
};

const sanitizeLiquidacion = (liquidacion, rol) => {
  if (!liquidacion || canViewLiquidaciones(rol)) {
    return liquidacion;
  }
  return omitirCampos(liquidacion, CAMPOS_LIQUIDACION_SENSIBLES);
};

const sanitizeLiquidacionesList = (liquidaciones, rol) => {
  if (!Array.isArray(liquidaciones)) {
    return liquidaciones;
  }
  return liquidaciones.map((row) => sanitizeLiquidacion(row, rol));
};

const sanitizeResumenLiquidacion = (resumen, rol) => {
  if (!resumen || canViewLiquidaciones(rol)) {
    return resumen;
  }

  const sanitizado = omitirCampos(resumen, CAMPOS_LIQUIDACION_SENSIBLES);
  if (sanitizado.empleado) {
    sanitizado.empleado = sanitizeEmpleado(sanitizado.empleado, rol);
  }
  if (sanitizado.detalle) {
    sanitizado.detalle = {
      ...sanitizado.detalle,
      movimientos: Array.isArray(sanitizado.detalle.movimientos)
        ? sanitizado.detalle.movimientos
        : sanitizado.detalle.movimientos,
    };
  }
  return sanitizado;
};

module.exports = {
  sanitizeEmpleado,
  sanitizeEmpleadosList,
  sanitizeLiquidacion,
  sanitizeLiquidacionesList,
  sanitizeResumenLiquidacion,
};
