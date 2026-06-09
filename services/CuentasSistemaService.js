const db = require('../controllers/dbPromise');

let cache = { X: null, ARCA: null, loadedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function cargarCache(connection = null) {
  const now = Date.now();
  if (cache.X && cache.ARCA && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  const exec = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => db.execute(sql, params);
  const [rows] = await exec(
    `SELECT id, nombre, saldo FROM cuentas_fondos WHERE nombre IN ('X', 'ARCA') AND es_sistema = 1`
  );
  const map = {};
  for (const row of rows) {
    map[row.nombre] = row;
  }
  if (!map.X || !map.ARCA) {
    throw new Error('Cuentas de sistema X/ARCA no configuradas. Ejecute migración 007.');
  }
  cache = { X: map.X, ARCA: map.ARCA, loadedAt: now };
  return cache;
}

async function obtenerCuentaX(connection = null) {
  const c = await cargarCache(connection);
  return c.X;
}

async function obtenerCuentaArca(connection = null) {
  const c = await cargarCache(connection);
  return c.ARCA;
}

async function obtenerCuentaPorNombre(nombre, connection = null) {
  if (nombre === 'X') return obtenerCuentaX(connection);
  if (nombre === 'ARCA') return obtenerCuentaArca(connection);
  throw new Error(`Cuenta de sistema desconocida: ${nombre}`);
}

async function acreditarCuenta(connection, cuentaId, monto, origen, referenciaId) {
  const total = parseFloat(monto) || 0;
  if (total <= 0) return;

  const [saldoRows] = await connection.execute(
    'SELECT saldo FROM cuentas_fondos WHERE id = ? FOR UPDATE',
    [cuentaId]
  );
  if (!saldoRows.length) {
    throw new Error(`Cuenta ${cuentaId} no encontrada`);
  }
  const saldoAnterior = parseFloat(saldoRows[0].saldo) || 0;
  const saldoNuevo = saldoAnterior + total;

  await connection.execute('UPDATE cuentas_fondos SET saldo = ? WHERE id = ?', [saldoNuevo, cuentaId]);
  await connection.execute(
    `INSERT INTO movimientos_fondos (
      fecha, cuenta_id, tipo, origen, referencia_id, monto, saldo_anterior, saldo_nuevo
    ) VALUES (NOW(), ?, 'INGRESO', ?, ?, ?, ?, ?)`,
    [cuentaId, origen, referenciaId, total, saldoAnterior, saldoNuevo]
  );
}

async function debitarCuenta(connection, cuentaId, monto, origen, referenciaId) {
  const total = parseFloat(monto) || 0;
  if (total <= 0) return;

  const [saldoRows] = await connection.execute(
    'SELECT saldo FROM cuentas_fondos WHERE id = ? FOR UPDATE',
    [cuentaId]
  );
  if (!saldoRows.length) {
    throw new Error(`Cuenta ${cuentaId} no encontrada`);
  }
  const saldoAnterior = parseFloat(saldoRows[0].saldo) || 0;
  const saldoNuevo = saldoAnterior - total;

  await connection.execute('UPDATE cuentas_fondos SET saldo = ? WHERE id = ?', [saldoNuevo, cuentaId]);
  await connection.execute(
    `INSERT INTO movimientos_fondos (
      fecha, cuenta_id, tipo, origen, referencia_id, monto, saldo_anterior, saldo_nuevo
    ) VALUES (NOW(), ?, 'EGRESO', ?, ?, ?, ?, ?)`,
    [cuentaId, origen, referenciaId, total, saldoAnterior, saldoNuevo]
  );
}

function invalidarCache() {
  cache.loadedAt = 0;
}

module.exports = {
  obtenerCuentaX,
  obtenerCuentaArca,
  obtenerCuentaPorNombre,
  acreditarCuenta,
  debitarCuenta,
  invalidarCache
};
