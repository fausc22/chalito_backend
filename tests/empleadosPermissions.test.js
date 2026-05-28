const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { canAccess, ROLES, MODULES } = require('../config/permissions');
const {
  canViewLiquidaciones,
  canViewValorHora,
  canMutateEmpleado,
  canOperateAsistenciaMovimientos,
} = require('../config/empleadosPermissions');
const {
  sanitizeEmpleado,
  sanitizeEmpleadosList,
} = require('../utils/empleadosResponseSanitizer');
const { authorizeModule } = require('../middlewares/authMiddleware');
const { requireEmpleadosCapability } = require('../middlewares/empleadosGuards');

const empleadoEjemplo = {
  id: 1,
  nombre: 'Juan',
  apellido: 'Perez',
  valor_hora: 3500.5,
  activo: true,
};

const injectUser = (req, _res, next) => {
  const rol = req.headers['x-test-rol'];
  if (!rol) {
    return next();
  }
  req.user = { id: 1, rol, usuario: 'test_user', nombre: 'Test' };
  next();
};

const runGuardStack = async (stack, rol) => {
  const req = { headers: { 'x-test-rol': rol }, user: { id: 1, rol, usuario: 'u' } };
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };
  let index = 0;
  const next = (err) => {
    if (err) throw err;
    const mw = stack[index++];
    if (!mw) return;
    Promise.resolve(mw(req, res, next)).catch((e) => {
      throw e;
    });
  };
  await new Promise((resolve, reject) => {
    const wrappedNext = (err) => {
      if (err) return reject(err);
      const mw = stack[index++];
      if (!mw) return resolve({ statusCode, body });
      try {
        const result = mw(req, res, wrappedNext);
        if (result && typeof result.then === 'function') {
          result.catch(reject);
        }
      } catch (e) {
        reject(e);
      }
    };
    wrappedNext();
  });
  return { statusCode, body };
};

/** Stacks equivalentes a routeGuards, sin JWT/BD (req.user ya inyectado). */
const testReadEmpleados = [authorizeModule(MODULES.EMPLEADOS, 'read')];
const testMutateEmpleadosMaster = [
  authorizeModule(MODULES.EMPLEADOS, 'write'),
  requireEmpleadosCapability(canMutateEmpleado, 'mutar_empleado'),
];
const testWriteEmpleadosLiquidaciones = [
  authorizeModule(MODULES.EMPLEADOS, 'write'),
  requireEmpleadosCapability(canViewLiquidaciones, 'liquidaciones'),
];
const testOperateAsistenciaMovimientos = [
  authorizeModule(MODULES.EMPLEADOS, 'read'),
  requireEmpleadosCapability(canOperateAsistenciaMovimientos, 'operacion_asistencia_movimientos'),
];

const buildEmpleadosTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(injectUser);

  app.get('/empleados', ...testReadEmpleados, (req, res) => {
    const data = [empleadoEjemplo];
    res.json({
      success: true,
      data: sanitizeEmpleadosList(data, req.user.rol),
    });
  });

  app.get('/empleados/liquidaciones', ...testWriteEmpleadosLiquidaciones, (_req, res) => {
    res.json({ success: true, data: [] });
  });

  app.get('/empleados/liquidaciones/resumen', ...testWriteEmpleadosLiquidaciones, (_req, res) => {
    res.json({ success: true, data: { total_final: 100 } });
  });

  app.post('/empleados/liquidaciones/calcular', ...testWriteEmpleadosLiquidaciones, (_req, res) => {
    res.json({ success: true });
  });

  app.post('/empleados/liquidaciones', ...testWriteEmpleadosLiquidaciones, (_req, res) => {
    res.status(201).json({ success: true });
  });

  app.post('/empleados/asistencias/ingreso', ...testOperateAsistenciaMovimientos, (_req, res) => {
    res.status(201).json({ success: true });
  });

  app.post('/empleados', ...testMutateEmpleadosMaster, (_req, res) => {
    res.status(201).json({ success: true });
  });

  app.get('/empleados/:id', ...testReadEmpleados, (req, res) => {
    res.json({
      success: true,
      data: sanitizeEmpleado(empleadoEjemplo, req.user.rol),
    });
  });

  app.put('/empleados/:id', ...testMutateEmpleadosMaster, (_req, res) => {
    res.json({ success: true });
  });

  app.patch('/empleados/:id/activo', ...testMutateEmpleadosMaster, (_req, res) => {
    res.json({ success: true });
  });

  return app;
};

describe('matriz permissions empleados', () => {
  test('ADMIN tiene empleados write', () => {
    assert.equal(canAccess(ROLES.ADMIN, MODULES.EMPLEADOS, 'write'), true);
    assert.equal(canAccess(ROLES.ADMIN, MODULES.EMPLEADOS, 'read'), true);
  });

  test('GERENTE tiene empleados read pero no write', () => {
    assert.equal(canAccess(ROLES.GERENTE, MODULES.EMPLEADOS, 'read'), true);
    assert.equal(canAccess(ROLES.GERENTE, MODULES.EMPLEADOS, 'write'), false);
  });

  test('CAJERO y COCINA sin acceso a empleados', () => {
    assert.equal(canAccess(ROLES.CAJERO, MODULES.EMPLEADOS, 'read'), false);
    assert.equal(canAccess(ROLES.COCINA, MODULES.EMPLEADOS, 'read'), false);
  });
});

describe('empleadosPermissions helpers', () => {
  test('capacidades financieras y maestro solo ADMIN', () => {
    assert.equal(canViewLiquidaciones(ROLES.ADMIN), true);
    assert.equal(canViewLiquidaciones(ROLES.GERENTE), false);
    assert.equal(canViewValorHora(ROLES.ADMIN), true);
    assert.equal(canViewValorHora(ROLES.GERENTE), false);
    assert.equal(canMutateEmpleado(ROLES.ADMIN), true);
    assert.equal(canMutateEmpleado(ROLES.GERENTE), false);
  });

  test('operacion asistencia/movimientos ADMIN y GERENTE', () => {
    assert.equal(canOperateAsistenciaMovimientos(ROLES.ADMIN), true);
    assert.equal(canOperateAsistenciaMovimientos(ROLES.GERENTE), true);
    assert.equal(canOperateAsistenciaMovimientos(ROLES.CAJERO), false);
  });
});

describe('sanitizer valor_hora', () => {
  test('ADMIN conserva valor_hora', () => {
    const row = sanitizeEmpleado(empleadoEjemplo, ROLES.ADMIN);
    assert.equal(row.valor_hora, 3500.5);
  });

  test('GERENTE no recibe valor_hora', () => {
    const row = sanitizeEmpleado(empleadoEjemplo, ROLES.GERENTE);
    assert.equal('valor_hora' in row, false);
    assert.equal(row.nombre, 'Juan');
  });

  test('lista sanitizada para GERENTE', () => {
    const list = sanitizeEmpleadosList([empleadoEjemplo], ROLES.GERENTE);
    assert.equal(list.length, 1);
    assert.equal('valor_hora' in list[0], false);
  });
});

describe('guards HTTP empleados (app de prueba)', () => {
  const app = buildEmpleadosTestApp();

  test('ADMIN puede GET /empleados con valor_hora', async () => {
    const res = await request(app).get('/empleados').set('x-test-rol', ROLES.ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].valor_hora, 3500.5);
  });

  test('GERENTE puede GET /empleados sin valor_hora', async () => {
    const res = await request(app).get('/empleados').set('x-test-rol', ROLES.GERENTE);
    assert.equal(res.status, 200);
    assert.equal('valor_hora' in res.body.data[0], false);
  });

  test('CAJERO no puede GET /empleados', async () => {
    const res = await request(app).get('/empleados').set('x-test-rol', ROLES.CAJERO);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'INSUFFICIENT_PERMISSION');
  });

  test('COCINA no puede GET /empleados', async () => {
    const res = await request(app).get('/empleados').set('x-test-rol', ROLES.COCINA);
    assert.equal(res.status, 403);
  });

  test('ADMIN recibe valor_hora en GET /empleados/:id', async () => {
    const res = await request(app).get('/empleados/1').set('x-test-rol', ROLES.ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.valor_hora, 3500.5);
  });

  test('GERENTE no recibe valor_hora en GET /empleados/:id', async () => {
    const res = await request(app).get('/empleados/1').set('x-test-rol', ROLES.GERENTE);
    assert.equal(res.status, 200);
    assert.equal('valor_hora' in res.body.data, false);
  });

  test('ADMIN puede POST /empleados', async () => {
    const res = await request(app).post('/empleados').set('x-test-rol', ROLES.ADMIN).send({});
    assert.equal(res.status, 201);
  });

  test('GERENTE recibe 403 en POST /empleados', async () => {
    const res = await request(app).post('/empleados').set('x-test-rol', ROLES.GERENTE).send({});
    assert.equal(res.status, 403);
  });

  test('ADMIN puede PUT /empleados/:id', async () => {
    const res = await request(app).put('/empleados/1').set('x-test-rol', ROLES.ADMIN).send({});
    assert.equal(res.status, 200);
  });

  test('GERENTE recibe 403 en PUT /empleados/:id', async () => {
    const res = await request(app).put('/empleados/1').set('x-test-rol', ROLES.GERENTE).send({});
    assert.equal(res.status, 403);
  });

  test('ADMIN puede PATCH /empleados/:id/activo', async () => {
    const res = await request(app)
      .patch('/empleados/1/activo')
      .set('x-test-rol', ROLES.ADMIN)
      .send({ activo: false });
    assert.equal(res.status, 200);
  });

  test('GERENTE recibe 403 en PATCH /empleados/:id/activo', async () => {
    const res = await request(app)
      .patch('/empleados/1/activo')
      .set('x-test-rol', ROLES.GERENTE)
      .send({ activo: false });
    assert.equal(res.status, 403);
  });

  test('ADMIN puede acceder a liquidaciones', async () => {
    const res = await request(app)
      .get('/empleados/liquidaciones')
      .set('x-test-rol', ROLES.ADMIN);
    assert.equal(res.status, 200);
  });

  test('GERENTE recibe 403 en liquidaciones', async () => {
    const getList = await request(app)
      .get('/empleados/liquidaciones')
      .set('x-test-rol', ROLES.GERENTE);
    assert.equal(getList.status, 403);

    const resumen = await request(app)
      .get('/empleados/liquidaciones/resumen')
      .set('x-test-rol', ROLES.GERENTE);
    assert.equal(resumen.status, 403);

    const calcular = await request(app)
      .post('/empleados/liquidaciones/calcular')
      .set('x-test-rol', ROLES.GERENTE)
      .send({});
    assert.equal(calcular.status, 403);

    const crear = await request(app)
      .post('/empleados/liquidaciones')
      .set('x-test-rol', ROLES.GERENTE)
      .send({});
    assert.equal(crear.status, 403);
  });

  test('GERENTE puede operar asistencia (POST ingreso)', async () => {
    const res = await request(app)
      .post('/empleados/asistencias/ingreso')
      .set('x-test-rol', ROLES.GERENTE)
      .send({ empleado_id: 1 });
    assert.equal(res.status, 201);
  });
});

describe('authorizeModule empleados write', () => {
  test('GERENTE bloqueado en empleados write', async () => {
    const mw = authorizeModule(MODULES.EMPLEADOS, 'write');
    const result = await runGuardStack([mw], ROLES.GERENTE);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.module, MODULES.EMPLEADOS);
  });
});
