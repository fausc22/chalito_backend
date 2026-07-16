const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('iniciarPreparacionManual no usa tope fijo de 20', () => {
  const controllerPath = path.join(__dirname, '../../controllers/pedidosController.js');
  const source = fs.readFileSync(controllerPath, 'utf8');
  const fnStart = source.indexOf('const iniciarPreparacionManual = async');
  assert.ok(fnStart >= 0);
  const fnBlock = source.slice(fnStart, fnStart + 4500);
  assert.doesNotMatch(fnBlock, /capacidadMaximaManual\s*=\s*20/);
  assert.doesNotMatch(fnBlock, /Math\.min\([\s\S]*?20/);
  assert.match(fnBlock, /obtenerInfoCapacidadEnTransaccion/);
});

test('registrarComandaImpresa está exportado y enruta POST', () => {
  const controllerPath = path.join(__dirname, '../../controllers/pedidosController.js');
  const routesPath = path.join(__dirname, '../../routes/pedidosRoutes.js');
  const controller = fs.readFileSync(controllerPath, 'utf8');
  const routes = fs.readFileSync(routesPath, 'utf8');
  assert.match(controller, /const registrarComandaImpresa = async/);
  assert.match(controller, /registrarComandaImpresa/);
  assert.match(routes, /comanda-impresa/);
  assert.match(routes, /registrarComandaImpresa/);
});
