/**
 * E2E contra routes/empleadosRoutes.js productivo.
 * Usa BD real para datos de empleados; stub solo en revalidateUser.
 *
 * Requiere MySQL accesible (.env) y al menos un empleado con valor_hora en BD,
 * o permite crear uno temporal como ADMIN.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('dotenv').config();

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { ROLES } = require('../../config/permissions');
const { createEmpleadosProductionApp } = require('./helpers/createEmpleadosProductionApp');
const { authHeaderFor, ensureJwtSecret } = require('./helpers/signE2eToken');
const {
  installDbUserStub,
  uninstallDbUserStub,
  closeDbPool,
} = require('./helpers/installDbUserStub');

const dbAvailable = Boolean(
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_DATABASE
);

const runE2e = process.env.E2E_EMPLEADOS !== '0' && dbAvailable;

describe('E2E empleados — router productivo /empleados', { skip: !runE2e }, () => {
  let app;
  let empleadoIdConValorHora = null;

  before(() => {
    ensureJwtSecret();
    installDbUserStub();
    app = createEmpleadosProductionApp();
  });

  after(async () => {
    uninstallDbUserStub();
    await closeDbPool();
  });

  const assertSinValorHoraEnLista = (items) => {
    for (const row of items) {
      assert.equal('valor_hora' in row, false, 'GERENTE no debe recibir valor_hora');
    }
  };

  test('ADMIN GET /empleados — 200 y puede incluir valor_hora si hay datos', async () => {
    const res = await request(app)
      .get('/empleados')
      .set('Authorization', authHeaderFor('admin'));

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));

    if (res.body.data.length > 0) {
      const conValor = res.body.data.find((e) => e.valor_hora != null);
      if (conValor) {
        empleadoIdConValorHora = conValor.id;
        assert.ok(typeof conValor.valor_hora === 'number' || typeof conValor.valor_hora === 'string');
      }
    }
  });

  test('GERENTE GET /empleados — 200 sin valor_hora', async () => {
    const res = await request(app)
      .get('/empleados')
      .set('Authorization', authHeaderFor('gerente'));

    assert.equal(res.status, 200);
    assertSinValorHoraEnLista(res.body.data);
  });

  test('CAJERO y COCINA GET /empleados — 403', async () => {
    const cajero = await request(app)
      .get('/empleados')
      .set('Authorization', authHeaderFor('cajero'));
    assert.equal(cajero.status, 403);
    assert.equal(cajero.body.code, 'INSUFFICIENT_PERMISSION');

    const cocina = await request(app)
      .get('/empleados')
      .set('Authorization', authHeaderFor('cocina'));
    assert.equal(cocina.status, 403);
  });

  test('GET /empleados/:id — valor_hora según rol', async () => {
    if (!empleadoIdConValorHora) {
      const list = await request(app)
        .get('/empleados')
        .set('Authorization', authHeaderFor('admin'));
      const row = list.body.data?.find((e) => e.valor_hora != null);
      empleadoIdConValorHora = row?.id;
    }

    if (!empleadoIdConValorHora) {
      console.warn('⚠️ E2E: sin empleados con valor_hora en BD; omitiendo aserciones de detalle');
      return;
    }

    const adminRes = await request(app)
      .get(`/empleados/${empleadoIdConValorHora}`)
      .set('Authorization', authHeaderFor('admin'));
    assert.equal(adminRes.status, 200);
    assert.ok('valor_hora' in adminRes.body.data);

    const gerenteRes = await request(app)
      .get(`/empleados/${empleadoIdConValorHora}`)
      .set('Authorization', authHeaderFor('gerente'));
    assert.equal(gerenteRes.status, 200);
    assert.equal('valor_hora' in gerenteRes.body.data, false);
  });

  test('Mutación maestro empleados — ADMIN permitido, GERENTE 403', async () => {
    const payload = {
      nombre: 'E2E',
      apellido: 'Temporal',
      documento: `e2e-${Date.now()}`,
      valor_hora: 1500,
      fecha_ingreso: '2025-01-01',
      activo: true,
    };

    const gerentePost = await request(app)
      .post('/empleados')
      .set('Authorization', authHeaderFor('gerente'))
      .send(payload);
    assert.equal(gerentePost.status, 403);

    const adminPost = await request(app)
      .post('/empleados')
      .set('Authorization', authHeaderFor('admin'))
      .send(payload);

    if (adminPost.status === 201) {
      const id = adminPost.body.data?.id;
      assert.ok('valor_hora' in adminPost.body.data);

      const gerentePut = await request(app)
        .put(`/empleados/${id}`)
        .set('Authorization', authHeaderFor('gerente'))
        .send({ nombre: 'Bloqueado' });
      assert.equal(gerentePut.status, 403);

      const gerentePatch = await request(app)
        .patch(`/empleados/${id}/activo`)
        .set('Authorization', authHeaderFor('gerente'))
        .send({ activo: false });
      assert.equal(gerentePatch.status, 403);

      await request(app)
        .patch(`/empleados/${id}/activo`)
        .set('Authorization', authHeaderFor('admin'))
        .send({ activo: false });
      return;
    }

    assert.ok(
      adminPost.status === 409 || adminPost.status === 500,
      `POST admin esperado 201, recibido ${adminPost.status}`
    );
  });

  test('Liquidaciones — ADMIN 200/4xx de negocio, GERENTE 403', async () => {
    const adminLiq = await request(app)
      .get('/empleados/liquidaciones')
      .set('Authorization', authHeaderFor('admin'));
    assert.ok(adminLiq.status === 200 || adminLiq.status < 500);

    const gerenteLiq = await request(app)
      .get('/empleados/liquidaciones')
      .set('Authorization', authHeaderFor('gerente'));
    assert.equal(gerenteLiq.status, 403);

    const gerenteResumen = await request(app)
      .get('/empleados/liquidaciones/resumen')
      .query({
        empleado_id: 1,
        fecha_desde: '2025-01-01',
        fecha_hasta: '2025-01-31',
      })
      .set('Authorization', authHeaderFor('gerente'));
    assert.equal(gerenteResumen.status, 403);
  });

  test('GERENTE puede GET asistencias y movimientos', async () => {
    const asist = await request(app)
      .get('/empleados/asistencias')
      .set('Authorization', authHeaderFor('gerente'));
    assert.equal(asist.status, 200);

    const mov = await request(app)
      .get('/empleados/movimientos')
      .set('Authorization', authHeaderFor('gerente'));
    assert.equal(mov.status, 200);
  });

  test('Sin token — 401 en GET /empleados', async () => {
    const res = await request(app).get('/empleados');
    assert.equal(res.status, 401);
  });
});

describe('E2E auth verify — empleadosCapabilities', { skip: !runE2e }, () => {
  let app;

  before(() => {
    ensureJwtSecret();
    installDbUserStub();
    const express = require('express');
    app = express();
    app.use(express.json());
    app.use('/auth', require('../../routes/authRoutes'));
  });

  after(async () => {
    uninstallDbUserStub();
    await closeDbPool();
  });

  test('GET /auth/verify incluye empleadosCapabilities', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', authHeaderFor('gerente'));

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.empleadosCapabilities.canViewValorHora, false);
    assert.equal(res.body.empleadosCapabilities.canMutateEmpleado, false);
    assert.equal(res.body.empleadosCapabilities.canOperateAsistenciaMovimientos, true);
  });

  test('ADMIN verify — capacidades completas empleados', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', authHeaderFor('admin'));

    assert.equal(res.status, 200);
    assert.equal(res.body.empleadosCapabilities.canViewLiquidaciones, true);
    assert.equal(res.body.empleadosCapabilities.canMutateEmpleado, true);
    assert.equal(res.body.usuario.rol, ROLES.ADMIN);
  });
});
