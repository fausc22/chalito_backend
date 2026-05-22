function getDb() {
    return require('../controllers/dbPromise');
}

/**
 * Carga lineas de pedidos_contenido para armar el mensaje WhatsApp.
 * @param {number} pedidoId
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
async function loadPedidoContenidoForWhatsApp(pedidoId, connection = null) {
    const db = connection || getDb();
    const [rows] = await db.execute(
        `SELECT articulo_nombre, cantidad, personalizaciones, observaciones
         FROM pedidos_contenido
         WHERE pedido_id = ?
         ORDER BY id ASC`,
        [pedidoId]
    );

    return (rows || []).map((row) => ({
        articulo_nombre: row.articulo_nombre,
        cantidad: row.cantidad,
        personalizaciones: row.personalizaciones,
        observaciones: row.observaciones,
    }));
}

/**
 * Datos minimos del pedido para notificacion WA (MP webhook, etc.)
 */
async function loadPedidoWhatsAppContext(pedidoId, connection = null) {
    const db = connection || getDb();
    const [rows] = await db.execute(
        `SELECT id, cliente_telefono, total, modalidad
         FROM pedidos
         WHERE id = ?
         LIMIT 1`,
        [pedidoId]
    );

    if (!rows.length) {
        return null;
    }

    const pedido = rows[0];
    const items = await loadPedidoContenidoForWhatsApp(pedidoId, connection);

    return {
        id: pedido.id,
        cliente_telefono: pedido.cliente_telefono,
        total: pedido.total,
        modalidad: pedido.modalidad,
        items,
    };
}

module.exports = {
    loadPedidoContenidoForWhatsApp,
    loadPedidoWhatsAppContext,
};
