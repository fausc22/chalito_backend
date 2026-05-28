const { authWithRevalidate, authorizeModule } = require('./authMiddleware');
const { requireEmpleadosCapability } = require('./empleadosGuards');
const { MODULES, canAccess, ROLES } = require('../config/permissions');
const {
  canViewLiquidaciones,
  canMutateEmpleado,
  canOperateAsistenciaMovimientos,
} = require('../config/empleadosPermissions');

const guard = (module, action = 'read') => [...authWithRevalidate, authorizeModule(module, action)];

const pedidosEstado = [
  ...authWithRevalidate,
  (req, res, next) => {
    const rol = req.user?.rol;
    if (canAccess(rol, MODULES.PEDIDOS, 'write')) return next();
    if (rol === ROLES.COCINA && canAccess(rol, MODULES.PEDIDOS, 'read')) return next();
    return res.status(403).json({
      message: 'No tienes permisos para cambiar el estado del pedido',
      code: 'INSUFFICIENT_PERMISSION',
      module: MODULES.PEDIDOS,
      action: 'write',
    });
  },
];

module.exports = {
  readDashboard: guard(MODULES.DASHBOARD, 'read'),
  readPedidos: guard(MODULES.PEDIDOS, 'read'),
  writePedidos: guard(MODULES.PEDIDOS, 'write'),
  readCocina: guard(MODULES.COCINA, 'read'),
  writeCocina: guard(MODULES.COCINA, 'write'),
  readVentas: guard(MODULES.VENTAS, 'read'),
  writeVentas: guard(MODULES.VENTAS, 'write'),
  readInventario: guard(MODULES.INVENTARIO, 'read'),
  writeInventario: guard(MODULES.INVENTARIO, 'write'),
  readEmpleados: guard(MODULES.EMPLEADOS, 'read'),
  writeEmpleados: guard(MODULES.EMPLEADOS, 'write'),
  writeEmpleadosLiquidaciones: [
    ...guard(MODULES.EMPLEADOS, 'write'),
    requireEmpleadosCapability(canViewLiquidaciones, 'liquidaciones'),
  ],
  mutateEmpleadosMaster: [
    ...guard(MODULES.EMPLEADOS, 'write'),
    requireEmpleadosCapability(canMutateEmpleado, 'mutar_empleado'),
  ],
  operateEmpleadosAsistenciaMovimientos: [
    ...guard(MODULES.EMPLEADOS, 'read'),
    requireEmpleadosCapability(canOperateAsistenciaMovimientos, 'operacion_asistencia_movimientos'),
  ],
  readGastos: guard(MODULES.GASTOS, 'read'),
  writeGastos: guard(MODULES.GASTOS, 'write'),
  readFondos: guard(MODULES.FONDOS, 'read'),
  writeFondos: guard(MODULES.FONDOS, 'write'),
  readReportes: guard(MODULES.REPORTES, 'read'),
  writeReportes: guard(MODULES.REPORTES, 'write'),
  readClientes: guard(MODULES.CLIENTES, 'read'),
  writeClientes: guard(MODULES.CLIENTES, 'write'),
  deleteClientes: guard(MODULES.CLIENTES, 'delete'),
  readConfiguracion: guard(MODULES.CONFIGURACION, 'read'),
  writeConfiguracion: guard(MODULES.CONFIGURACION, 'write'),
  readAuditoria: guard(MODULES.AUDITORIA, 'read'),
  writeUsuarios: guard(MODULES.USUARIOS, 'write'),
  readPerfil: guard(MODULES.PERFIL, 'read'),
  writePerfil: guard(MODULES.PERFIL, 'write'),
  pedidosEstado,
};
