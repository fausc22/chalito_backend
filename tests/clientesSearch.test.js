const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeName,
  normalizePhone,
  buildClienteSearchClause,
} = require('../services/ClientesService');

test('normalizePhone sin dígitos devuelve vacío', () => {
  assert.equal(normalizePhone('jorge rojas'), '');
});

test('buildClienteSearchClause: nombre sin telefono no usa LIKE %%', () => {
  const { clause, params } = buildClienteSearchClause('jorge rojas');
  assert.match(clause, /nombre_norm LIKE/);
  assert.doesNotMatch(clause, /telefono/);
  assert.equal(params.length, 2);
  assert.deepEqual(params, ['%jorge%', '%rojas%']);
});

test('buildClienteSearchClause: búsqueda numérica incluye teléfono', () => {
  const { clause, params } = buildClienteSearchClause('2302');
  assert.match(clause, /telefono LIKE/);
  assert.ok(params.some((p) => p.includes('2302')));
});

test('normalizeName quita tildes', () => {
  assert.equal(normalizeName('José María'), 'jose maria');
});
