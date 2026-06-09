/**
 * Servicio de Impresión — delega a PrintPayload v1 builders
 * @module services/PrintService
 */

const db = require('../controllers/dbPromise');
const { buildKitchenPayload } = require('./print/buildKitchenPayload');
const { buildCustomerPayload } = require('./print/buildCustomerPayload');

/**
 * Obtener PrintPayload v1 para ticket comandera (disponible desde pedido creado)
 * @param {number} pedidoId
 */
const obtenerDatosComanda = async (pedidoId) => {
    const [pedidos] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);

    if (pedidos.length === 0) {
        throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const pedido = pedidos[0];

    const [articulos] = await db.execute(
        'SELECT * FROM pedidos_contenido WHERE pedido_id = ? ORDER BY id',
        [pedidoId]
    );

    if (articulos.length === 0) {
        throw new Error(`El pedido ${pedidoId} no tiene artículos`);
    }

    return await buildKitchenPayload({ ...pedido, articulos });
};

/**
 * Buscar venta asociada a un pedido
 */
const buscarVentaAsociada = async (pedidoId) => {
    try {
        try {
            const [ventasPorPedido] = await db.execute(
                'SELECT * FROM ventas WHERE pedido_id = ? AND estado = ? ORDER BY fecha DESC LIMIT 1',
                [pedidoId, 'FACTURADA']
            );
            if (ventasPorPedido.length > 0) {
                return ventasPorPedido[0];
            }
        } catch (_) {
            // Columna pedido_id puede no existir
        }

        const [pedidos] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
        if (pedidos.length === 0) return null;

        const pedido = pedidos[0];

        const [ventas] = await db.execute(
            `SELECT * FROM ventas
             WHERE DATE(fecha) = DATE(?)
               AND (cliente_nombre = ? OR cliente_telefono = ?)
               AND ABS(total - ?) < 0.01
               AND estado = 'FACTURADA'
             ORDER BY fecha DESC
             LIMIT 1`,
            [pedido.fecha, pedido.cliente_nombre, pedido.cliente_telefono, pedido.total]
        );

        return ventas.length > 0 ? ventas[0] : null;
    } catch (error) {
        console.error('❌ Error buscando venta asociada:', error);
        throw error;
    }
};

/**
 * Obtener PrintPayload v1 para factura oficial ARCA (pedido ENTREGADO + CAE OK)
 * @param {number} pedidoId
 */
const obtenerDatosTicket = async (pedidoId) => {
    const [pedidos] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);

    if (pedidos.length === 0) {
        throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const pedido = pedidos[0];

    if (String(pedido.estado || '').trim().toUpperCase() !== 'ENTREGADO') {
        throw new Error(
            `El pedido ${pedidoId} no está entregado. La factura ARCA solo puede imprimirse cuando el pedido está ENTREGADO.`
        );
    }

    const venta = await buscarVentaAsociada(pedidoId);

    if (!venta) {
        throw new Error(`No existe una venta asociada al pedido ${pedidoId}`);
    }

    if (!venta.cae_id || String(venta.cae_estado || '').trim().toUpperCase() !== 'OK') {
        throw new Error(
            `CAE pendiente de autorización ARCA para el pedido ${pedidoId}. Reintentá en unos minutos.`
        );
    }

    const [articulosVenta] = await db.execute(
        'SELECT * FROM ventas_contenido WHERE venta_id = ? ORDER BY id',
        [venta.id]
    );

    if (articulosVenta.length === 0) {
        throw new Error(`La venta ${venta.id} no tiene artículos`);
    }

    return await buildCustomerPayload(pedido, venta, articulosVenta);
};

module.exports = {
    obtenerDatosComanda,
    obtenerDatosTicket,
    buscarVentaAsociada
};
