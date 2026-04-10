const { calcularTotalesDesdePrecioFinal, obtenerTotalFinalDesdeRegistro } = require('./totalesPrecioFinal');

const normalizarTotalesPedido = (pedido = {}) => {
    const totales = calcularTotalesDesdePrecioFinal(obtenerTotalFinalDesdeRegistro(pedido));

    return {
        ...pedido,
        ...totales
    };
};

function resolveUpdatedAt(pedido = {}) {
    return pedido.fecha_modificacion || pedido.updated_at || pedido.fecha || new Date();
}

function enrichPedidoRealtime(pedido = {}) {
    const updatedAt = resolveUpdatedAt(pedido);
    const updatedAtDate = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    const version = Number.isFinite(updatedAtDate.getTime())
        ? updatedAtDate.getTime()
        : Date.now();

    return {
        ...normalizarTotalesPedido(pedido),
        updated_at: updatedAtDate.toISOString(),
        version
    };
}

async function buildPedidoSnapshotById({ pedidoId, connection, includeArticulos = true }) {
    const [pedidoRows] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
    if (pedidoRows.length === 0) return null;

    let articulos = [];
    if (includeArticulos) {
        const [articulosRows] = await connection.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
            [pedidoId]
        );
        articulos = articulosRows;
    }

    return enrichPedidoRealtime({
        ...pedidoRows[0],
        ...(includeArticulos ? { articulos } : {})
    });
}

module.exports = {
    normalizarTotalesPedido,
    enrichPedidoRealtime,
    buildPedidoSnapshotById
};
