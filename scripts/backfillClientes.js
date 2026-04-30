const db = require('../controllers/dbPromise');

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').trim();

async function upsertCliente(connection, { nombre, telefono, email }) {
  const nombreSan = String(nombre || '').trim();
  const telefonoSan = normalizePhone(telefono);
  const emailSan = email ? String(email).trim().toLowerCase() : null;
  const nombreNorm = normalizeName(nombreSan);

  if (!telefonoSan) return null;

  await connection.query(
    `
      INSERT INTO clientes (nombre, nombre_norm, telefono, email, activo)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        nombre = IF(CHAR_LENGTH(VALUES(nombre)) > CHAR_LENGTH(nombre), VALUES(nombre), nombre),
        nombre_norm = IF(CHAR_LENGTH(VALUES(nombre)) > CHAR_LENGTH(nombre), VALUES(nombre_norm), nombre_norm),
        email = COALESCE(VALUES(email), email),
        activo = 1
    `,
    [nombreSan || telefonoSan, nombreNorm || telefonoSan, telefonoSan, emailSan]
  );

  const [rows] = await connection.query(
    'SELECT id FROM clientes WHERE telefono = ? LIMIT 1',
    [telefonoSan]
  );
  return rows?.[0]?.id || null;
}

async function upsertDireccion(connection, clienteId, direccion) {
  const direccionSan = String(direccion || '').trim();
  if (!clienteId || !direccionSan) return;

  const [rows] = await connection.query(
    'SELECT id FROM clientes_direcciones WHERE cliente_id = ? AND direccion = ? LIMIT 1',
    [clienteId, direccionSan]
  );

  if (rows.length > 0) {
    await connection.query(
      'UPDATE clientes_direcciones SET ultima_vez = NOW() WHERE id = ?',
      [rows[0].id]
    );
    return;
  }

  await connection.query(
    'INSERT INTO clientes_direcciones (cliente_id, direccion, ultima_vez) VALUES (?, ?, NOW())',
    [clienteId, direccionSan]
  );
}

async function run() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [pedidos] = await connection.query(`
      SELECT
        id,
        cliente_nombre,
        cliente_telefono,
        cliente_email,
        cliente_direccion,
        fecha
      FROM pedidos
      WHERE cliente_telefono IS NOT NULL
        AND TRIM(cliente_telefono) <> ''
      ORDER BY fecha DESC
    `);

    const byPhone = new Map();

    for (const pedido of pedidos) {
      const phone = normalizePhone(pedido.cliente_telefono);
      if (!phone) continue;
      if (!byPhone.has(phone)) {
        byPhone.set(phone, {
          telefono: phone,
          nombre: String(pedido.cliente_nombre || '').trim(),
          email: pedido.cliente_email || null,
          direccion: pedido.cliente_direccion || null,
        });
      }
    }

    for (const data of byPhone.values()) {
      const clienteId = await upsertCliente(connection, data);
      if (!clienteId) continue;

      await connection.query(
        'UPDATE pedidos SET cliente_id = ? WHERE REPLACE(REPLACE(REPLACE(REPLACE(cliente_telefono, " ", ""), "-", ""), "(", ""), ")", "") = ?',
        [clienteId, data.telefono]
      );

      await connection.query(
        'UPDATE ventas SET cliente_id = ? WHERE REPLACE(REPLACE(REPLACE(REPLACE(cliente_telefono, " ", ""), "-", ""), "(", ""), ")", "") = ?',
        [clienteId, data.telefono]
      );

      await upsertDireccion(connection, clienteId, data.direccion);
    }

    await connection.commit();
    console.log(`Backfill completado. Clientes procesados: ${byPhone.size}`);
  } catch (error) {
    await connection.rollback();
    console.error('Error ejecutando backfill de clientes:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await db.end();
  }
}

run();
