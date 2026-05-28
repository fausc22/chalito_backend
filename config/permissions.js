/**
 * Matriz de permisos por rol (sin tablas en BD).
 * Acciones: read | write | delete
 * write implica read; delete implica write donde aplique.
 */

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  GERENTE: 'GERENTE',
  CAJERO: 'CAJERO',
  COCINA: 'COCINA',
});

const MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  PEDIDOS: 'pedidos',
  COCINA: 'cocina',
  VENTAS: 'ventas',
  INVENTARIO: 'inventario',
  EMPLEADOS: 'empleados',
  GASTOS: 'gastos',
  FONDOS: 'fondos',
  REPORTES: 'reportes',
  CLIENTES: 'clientes',
  CONFIGURACION: 'configuracion',
  USUARIOS: 'usuarios',
  PERFIL: 'perfil',
  AUDITORIA: 'auditoria',
});

const ACTION_LEVEL = { read: 1, write: 2, delete: 3 };

/**
 * Nivel máximo por rol y módulo (0 = sin acceso)
 */
const ROLE_ACCESS = {
  [ROLES.ADMIN]: {
    [MODULES.DASHBOARD]: 'write',
    [MODULES.PEDIDOS]: 'write',
    [MODULES.COCINA]: 'write',
    [MODULES.VENTAS]: 'write',
    [MODULES.INVENTARIO]: 'write',
    [MODULES.EMPLEADOS]: 'write',
    [MODULES.GASTOS]: 'write',
    [MODULES.FONDOS]: 'write',
    [MODULES.REPORTES]: 'write',
    [MODULES.CLIENTES]: 'delete',
    [MODULES.CONFIGURACION]: 'write',
    [MODULES.USUARIOS]: 'write',
    [MODULES.PERFIL]: 'write',
    [MODULES.AUDITORIA]: 'write',
  },
  [ROLES.GERENTE]: {
    [MODULES.DASHBOARD]: 'write',
    [MODULES.PEDIDOS]: 'write',
    [MODULES.COCINA]: 'write',
    [MODULES.VENTAS]: 'write',
    [MODULES.INVENTARIO]: 'write',
    [MODULES.EMPLEADOS]: 'read',
    [MODULES.GASTOS]: 'write',
    [MODULES.FONDOS]: 'write',
    [MODULES.REPORTES]: 'write',
    [MODULES.CLIENTES]: 'write',
    [MODULES.CONFIGURACION]: 'write',
    [MODULES.USUARIOS]: null,
    [MODULES.PERFIL]: 'write',
    [MODULES.AUDITORIA]: 'read',
  },
  [ROLES.CAJERO]: {
    [MODULES.DASHBOARD]: 'read',
    [MODULES.PEDIDOS]: 'write',
    [MODULES.COCINA]: 'read',
    [MODULES.VENTAS]: 'write',
    [MODULES.INVENTARIO]: null,
    [MODULES.EMPLEADOS]: null,
    [MODULES.GASTOS]: null,
    [MODULES.FONDOS]: null,
    [MODULES.REPORTES]: null,
    [MODULES.CLIENTES]: 'read',
    [MODULES.CONFIGURACION]: null,
    [MODULES.USUARIOS]: null,
    [MODULES.PERFIL]: 'write',
    [MODULES.AUDITORIA]: null,
  },
  [ROLES.COCINA]: {
    [MODULES.DASHBOARD]: 'read',
    [MODULES.PEDIDOS]: 'read',
    [MODULES.COCINA]: 'write',
    [MODULES.VENTAS]: null,
    [MODULES.INVENTARIO]: null,
    [MODULES.EMPLEADOS]: null,
    [MODULES.GASTOS]: null,
    [MODULES.FONDOS]: null,
    [MODULES.REPORTES]: null,
    [MODULES.CLIENTES]: null,
    [MODULES.CONFIGURACION]: null,
    [MODULES.USUARIOS]: null,
    [MODULES.PERFIL]: 'write',
    [MODULES.AUDITORIA]: null,
  },
};

const VALID_ROLES = Object.values(ROLES);
const VALID_MODULES = Object.values(MODULES);

function getMaxAction(rol, module) {
  if (!rol || !module || !VALID_ROLES.includes(rol)) return null;
  const access = ROLE_ACCESS[rol];
  if (!access) return null;
  return access[module] || null;
}

function canAccess(rol, module, action = 'read') {
  const maxAction = getMaxAction(rol, module);
  if (!maxAction) return false;
  const required = ACTION_LEVEL[action] || ACTION_LEVEL.read;
  const granted = ACTION_LEVEL[maxAction] || 0;
  return granted >= required;
}

function getModulesForRole(rol, minAction = 'read') {
  return VALID_MODULES.filter((m) => canAccess(rol, m, minAction));
}

module.exports = {
  ROLES,
  MODULES,
  ROLE_ACCESS,
  ACTION_LEVEL,
  canAccess,
  getMaxAction,
  getModulesForRole,
};
