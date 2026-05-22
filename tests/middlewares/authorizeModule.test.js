const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorizeModule } = require('../../middlewares/authMiddleware');
const { MODULES } = require('../../config/permissions');

const runMiddleware = (mw, req = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
      },
    };
    mw(req, res, (err) => (err ? reject(err) : resolve({ statusCode: 200, body: null })));
  });

test('authorizeModule bloquea CAJERO en gastos', async () => {
  const mw = authorizeModule(MODULES.GASTOS, 'read');
  const result = await runMiddleware(mw, { user: { rol: 'CAJERO', id: 1 } });
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'INSUFFICIENT_PERMISSION');
});

test('authorizeModule permite GERENTE en gastos', async () => {
  const mw = authorizeModule(MODULES.GASTOS, 'write');
  const result = await runMiddleware(mw, { user: { rol: 'GERENTE', id: 2 } });
  assert.equal(result.statusCode, 200);
});
