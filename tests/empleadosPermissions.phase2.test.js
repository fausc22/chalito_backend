const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ROLES } = require('../config/permissions');
const { getEmpleadosCapabilities } = require('../config/empleadosPermissions');
const { prepareEmpleadoMasterPayload } = require('../utils/empleadosPayloadGuard');
const {
  assertCanMutateEmpleadoMaster,
  assertCanMutateValorHora,
} = require('../utils/empleadosAccessAssert');
const {
  sanitizeLiquidacion,
  sanitizeResumenLiquidacion,
} = require('../utils/empleadosResponseSanitizer');

test('getEmpleadosCapabilities refleja reglas GERENTE', () => {
  const caps = getEmpleadosCapabilities(ROLES.GERENTE);
  assert.equal(caps.canViewValorHora, false);
  assert.equal(caps.canMutateEmpleado, false);
  assert.equal(caps.canViewLiquidaciones, false);
  assert.equal(caps.canOperateAsistenciaMovimientos, true);
});

test('prepareEmpleadoMasterPayload rechaza valor_hora para GERENTE', () => {
  assert.throws(
    () => prepareEmpleadoMasterPayload({ nombre: 'A', valor_hora: 100 }, ROLES.GERENTE),
    (err) => err.status === 403 && err.code === 'INSUFFICIENT_PERMISSION'
  );
});

test('prepareEmpleadoMasterPayload permite valor_hora para ADMIN', () => {
  const payload = prepareEmpleadoMasterPayload({ nombre: 'A', valor_hora: 100 }, ROLES.ADMIN);
  assert.equal(payload.valor_hora, 100);
});

test('assertCanMutateEmpleadoMaster bloquea GERENTE', () => {
  assert.throws(
    () => assertCanMutateEmpleadoMaster(ROLES.GERENTE),
    (err) => err.status === 403
  );
});

test('assertCanMutateValorHora bloquea GERENTE', () => {
  assert.throws(
    () => assertCanMutateValorHora(ROLES.GERENTE),
    (err) => err.status === 403
  );
});

test('sanitizeLiquidacion omite campos financieros para GERENTE', () => {
  const row = {
    id: 1,
    valor_hora: 100,
    total_final: 5000,
    total_base: 4000,
    empleado_id: 2,
  };
  const out = sanitizeLiquidacion(row, ROLES.GERENTE);
  assert.equal('valor_hora' in out, false);
  assert.equal('total_final' in out, false);
  assert.equal(out.id, 1);
});

test('sanitizeResumenLiquidacion omite totales para GERENTE', () => {
  const resumen = {
    valor_hora: 100,
    total_final: 500,
    empleado: { id: 1, valor_hora: 100 },
  };
  const out = sanitizeResumenLiquidacion(resumen, ROLES.GERENTE);
  assert.equal('total_final' in out, false);
  assert.equal('valor_hora' in out.empleado, false);
});
