const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getInstance, SocketService } = require('../../services/SocketService');

test('SocketService exporta getInstance y no getSocketService', () => {
  assert.equal(typeof getInstance, 'function');
  assert.equal(typeof SocketService, 'function');
  assert.equal(require('../../services/SocketService').getSocketService, undefined);
});

test('getInstance alias getSocketService devuelve instancia usable', () => {
  const { getInstance: getSocketService } = require('../../services/SocketService');
  const mockIo = { emit: () => {} };
  const service = getSocketService(mockIo);
  assert.ok(service);
  assert.equal(typeof service.emitPedidoActualizado, 'function');
});

test('actualizarHorarioEntrega importa SocketService con getInstance alias', () => {
  const controllerPath = path.join(__dirname, '../../controllers/pedidosController.js');
  const source = fs.readFileSync(controllerPath, 'utf8');
  const fnStart = source.indexOf('const actualizarHorarioEntrega = async');
  assert.ok(fnStart >= 0, 'actualizarHorarioEntrega debe existir');

  const fnBlock = source.slice(fnStart, fnStart + 3500);
  assert.match(
    fnBlock,
    /const \{ getInstance: getSocketService \} = require\('\.\.\/services\/SocketService'\)/,
    'actualizarHorarioEntrega debe usar getInstance alias, no getSocketService directo'
  );
  assert.doesNotMatch(
    fnBlock,
    /const \{ getSocketService \} = require\('\.\.\/services\/SocketService'\)/,
    'actualizarHorarioEntrega no debe importar getSocketService inexistente'
  );
});
