const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canAccess, ROLES, MODULES } = require('../../config/permissions');

test('ADMIN tiene acceso a usuarios write', () => {
  assert.equal(canAccess(ROLES.ADMIN, MODULES.USUARIOS, 'write'), true);
});

test('GERENTE no tiene acceso a usuarios', () => {
  assert.equal(canAccess(ROLES.GERENTE, MODULES.USUARIOS, 'read'), false);
  assert.equal(canAccess(ROLES.GERENTE, MODULES.USUARIOS, 'write'), false);
});

test('CAJERO accede pedidos y ventas en lectura pero no gastos ni write ventas', () => {
  assert.equal(canAccess(ROLES.CAJERO, MODULES.PEDIDOS, 'write'), true);
  assert.equal(canAccess(ROLES.CAJERO, MODULES.VENTAS, 'read'), true);
  assert.equal(canAccess(ROLES.CAJERO, MODULES.VENTAS, 'write'), false);
  assert.equal(canAccess(ROLES.CAJERO, MODULES.GASTOS, 'read'), false);
});

test('COCINA accede cocina y lectura pedidos sin ventas', () => {
  assert.equal(canAccess(ROLES.COCINA, MODULES.COCINA, 'write'), true);
  assert.equal(canAccess(ROLES.COCINA, MODULES.PEDIDOS, 'read'), true);
  assert.equal(canAccess(ROLES.COCINA, MODULES.PEDIDOS, 'write'), false);
  assert.equal(canAccess(ROLES.COCINA, MODULES.VENTAS, 'read'), false);
});

test('ADMIN puede eliminar clientes', () => {
  assert.equal(canAccess(ROLES.ADMIN, MODULES.CLIENTES, 'delete'), true);
});

test('GERENTE puede write clientes pero no delete', () => {
  assert.equal(canAccess(ROLES.GERENTE, MODULES.CLIENTES, 'write'), true);
  assert.equal(canAccess(ROLES.GERENTE, MODULES.CLIENTES, 'delete'), false);
});

test('GERENTE y ADMIN acceden auditoria', () => {
  assert.equal(canAccess(ROLES.ADMIN, MODULES.AUDITORIA, 'read'), true);
  assert.equal(canAccess(ROLES.GERENTE, MODULES.AUDITORIA, 'read'), true);
  assert.equal(canAccess(ROLES.CAJERO, MODULES.AUDITORIA, 'read'), false);
});
