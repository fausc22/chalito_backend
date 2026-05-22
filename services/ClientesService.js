const db = require('../controllers/dbPromise');

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').trim();

const sanitizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
};

const runQuery = async (connection, sql, params = []) => {
  if (connection && typeof connection.query === 'function') {
    return connection.query(sql, params);
  }
  return db.query(sql, params);
};

async function upsertDireccion(connection, clienteId, direccion) {
  const direccionSan = String(direccion || '').trim();
  if (!clienteId || !direccionSan) return;

  const [existing] = await runQuery(
    connection,
    `SELECT id
     FROM clientes_direcciones
     WHERE cliente_id = ? AND direccion = ?
     LIMIT 1`,
    [clienteId, direccionSan]
  );

  if (existing.length > 0) {
    await runQuery(
      connection,
      'UPDATE clientes_direcciones SET ultima_vez = NOW() WHERE id = ?',
      [existing[0].id]
    );
    return;
  }

  await runQuery(
    connection,
    `INSERT INTO clientes_direcciones (cliente_id, direccion, ultima_vez)
     VALUES (?, ?, NOW())`,
    [clienteId, direccionSan]
  );
}

async function findOrCreate(rawData = {}, connection = null) {
  const telefono = normalizePhone(rawData.telefono);
  if (!telefono) return null;

  const nombre = String(rawData.nombre || '').trim() || telefono;
  const nombreNorm = normalizeName(nombre) || telefono;
  const email = sanitizeEmail(rawData.email);
  const direccion = rawData.direccion;

  await runQuery(
    connection,
    `
      INSERT INTO clientes (nombre, nombre_norm, telefono, email, activo)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        nombre = IF(CHAR_LENGTH(VALUES(nombre)) > CHAR_LENGTH(nombre), VALUES(nombre), nombre),
        nombre_norm = IF(CHAR_LENGTH(VALUES(nombre)) > CHAR_LENGTH(nombre), VALUES(nombre_norm), nombre_norm),
        email = COALESCE(VALUES(email), email),
        activo = 1
    `,
    [nombre, nombreNorm, telefono, email]
  );

  const [rows] = await runQuery(
    connection,
    `SELECT id, nombre, telefono, email, created_at, updated_at
     FROM clientes
     WHERE telefono = ?
     LIMIT 1`,
    [telefono]
  );

  if (rows.length === 0) return null;

  const cliente = rows[0];
  await upsertDireccion(connection, cliente.id, direccion);
  return cliente;
}

function buildClienteSearchClause(query = '') {
  const norm = normalizeName(query);
  const tokens = norm.split(' ').filter((t) => t.length > 0);
  const phoneDigits = normalizePhone(query);

  const parts = [];
  const params = [];

  if (tokens.length > 0) {
    const nameParts = tokens.map(() => 'c.nombre_norm LIKE ?');
    parts.push(`(${nameParts.join(' AND ')})`);
    params.push(...tokens.map((t) => `%${t}%`));
  }

  // Sin dígitos, telefono LIKE '%%' matchea a todos; solo filtrar por teléfono con 3+ dígitos.
  if (phoneDigits.length >= 3) {
    parts.push('c.telefono LIKE ?');
    params.push(`%${phoneDigits}%`);
  }

  if (!parts.length) {
    return { clause: '1 = 0', params: [] };
  }

  return {
    clause: `(${parts.join(' OR ')})`,
    params,
  };
}

async function buscarSugerencias(query = '') {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const { clause, params } = buildClienteSearchClause(q);
  const norm = normalizeName(q);
  const prefix = `${norm}%`;
  const contains = `%${norm}%`;

  const [clientes] = await db.query(
    `
      SELECT
        c.id,
        c.nombre,
        c.telefono,
        c.email,
        (
          SELECT cd.direccion
          FROM clientes_direcciones cd
          WHERE cd.cliente_id = c.id
          ORDER BY cd.ultima_vez DESC
          LIMIT 1
        ) AS ultima_direccion
      FROM clientes c
      WHERE c.activo = 1
        AND ${clause}
      ORDER BY
        CASE
          WHEN c.nombre_norm LIKE ? THEN 0
          WHEN c.nombre_norm LIKE ? THEN 1
          ELSE 2
        END,
        c.updated_at DESC
      LIMIT 10
    `,
    [...params, prefix, contains]
  );

  return clientes;
}

async function listar({ page = 1, limit = 20, q = '' } = {}) {
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const offset = (currentPage - 1) * pageSize;
  const query = String(q || '').trim();
  const hasFilter = query.length >= 1;
  const search = hasFilter ? buildClienteSearchClause(query) : { clause: '1 = 1', params: [] };

  const where = hasFilter
    ? `WHERE c.activo = 1 AND ${search.clause}`
    : 'WHERE c.activo = 1';
  const params = hasFilter ? search.params : [];

  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.nombre,
        c.telefono,
        c.email,
        c.created_at,
        c.updated_at,
        (
          SELECT COUNT(*)
          FROM pedidos p
          WHERE p.cliente_id = c.id
        ) AS cantidad_pedidos,
        (
          SELECT MAX(p.fecha)
          FROM pedidos p
          WHERE p.cliente_id = c.id
        ) AS ultima_compra,
        (
          SELECT COALESCE(SUM(v.total), 0)
          FROM ventas v
          WHERE v.cliente_id = c.id
            AND v.estado <> 'ANULADA'
        ) AS total_gastado
      FROM clientes c
      ${where}
      ORDER BY c.updated_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `,
    params
  );

  const [countRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM clientes c
      ${where}
    `,
    params
  );

  return {
    items: rows,
    pagination: {
      page: currentPage,
      limit: pageSize,
      total: Number(countRows[0]?.total || 0),
    },
  };
}

async function obtenerHistorial(clienteId, { limit = 20 } = {}) {
  const id = Number(clienteId);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 20));
  if (!Number.isFinite(id) || id <= 0) {
    return { pedidos: [], ventas: [], direcciones: [] };
  }

  const [pedidos] = await db.query(
    `
      SELECT id, fecha, estado, estado_pago, total, modalidad, origen_pedido
      FROM pedidos
      WHERE cliente_id = ?
      ORDER BY fecha DESC
      LIMIT ${pageSize}
    `,
    [id]
  );

  const [ventas] = await db.query(
    `
      SELECT id, fecha, estado, total, medio_pago, tipo_factura
      FROM ventas
      WHERE cliente_id = ?
      ORDER BY fecha DESC
      LIMIT ${pageSize}
    `,
    [id]
  );

  const [direcciones] = await db.query(
    `
      SELECT id, direccion, alias, ultima_vez
      FROM clientes_direcciones
      WHERE cliente_id = ?
      ORDER BY ultima_vez DESC
      LIMIT 10
    `,
    [id]
  );

  return { pedidos, ventas, direcciones };
}

async function obtenerPorId(clienteId) {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const [rows] = await db.query(
    `
      SELECT id, nombre, telefono, email, activo, created_at, updated_at
      FROM clientes
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function actualizar(clienteId, { nombre, email } = {}) {
  const cliente = await obtenerPorId(clienteId);
  if (!cliente) return null;

  const nombreFinal = String(nombre ?? cliente.nombre).trim() || cliente.nombre;
  const nombreNorm = normalizeName(nombreFinal) || normalizeName(cliente.nombre);
  const emailFinal = email === undefined ? cliente.email : sanitizeEmail(email);

  await db.query(
    `
      UPDATE clientes
      SET nombre = ?, nombre_norm = ?, email = ?
      WHERE id = ?
    `,
    [nombreFinal, nombreNorm, emailFinal, cliente.id]
  );

  return obtenerPorId(cliente.id);
}

async function eliminar(clienteId) {
  const id = Number(clienteId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const [result] = await db.query(
    'UPDATE clientes SET activo = 0 WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  normalizeName,
  normalizePhone,
  buildClienteSearchClause,
  findOrCreate,
  buscarSugerencias,
  listar,
  obtenerHistorial,
  obtenerPorId,
  actualizar,
  eliminar,
};
