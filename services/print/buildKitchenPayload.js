/**
 * PrintPayload v1 — comanda de cocina (sin precios)
 */

const {
    PRINT_PAYLOAD_VERSION,
    PAPER_WIDTH_MM,
    formatFechaHora,
    mapExtrasNames,
    buildScheduledLabel,
    normalizeModality,
    formatModalityLabel,
    formatMoney,
    normalizePaymentStatus,
    getBusinessBlockAsync,
    buildMeta
} = require('./printPayloadShared');

const buildKitchenLines = (articulos = []) =>
    articulos.map((articulo) => ({
        qty: articulo.cantidad || 1,
        name: articulo.articulo_nombre || articulo.nombre || 'Artículo',
        modifiers: mapExtrasNames(articulo),
        lineNote: articulo.observaciones || null
    }));

/**
 * @param {Object} pedido - fila pedidos + articulos[]
 */
const buildKitchenPayload = async (pedido) => {
    const scheduledLabel = buildScheduledLabel(pedido);
    const modality = normalizeModality(pedido.modalidad);
    const total = parseFloat(pedido.total);
    const business = await getBusinessBlockAsync();

    return {
        version: PRINT_PAYLOAD_VERSION,
        kind: 'kitchen',
        paperWidthMm: PAPER_WIDTH_MM,
        business,
        order: {
            id: pedido.id,
            number: pedido.id,
            createdAt: pedido.fecha,
            createdAtLabel: formatFechaHora(pedido.fecha),
            scheduledLabel,
            modality,
            modalityLabel: formatModalityLabel(pedido.modalidad),
            total: Number.isFinite(total) ? total : 0,
            totalLabel: formatMoney(Number.isFinite(total) ? total : 0),
            paymentStatus: normalizePaymentStatus(pedido.estado_pago),
            orderStatus: pedido.estado || null,
            orderNotes: pedido.observaciones || null
        },
        customer: {
            name: pedido.cliente_nombre || 'MOSTRADOR',
            phone: pedido.cliente_telefono || null,
            address: pedido.cliente_direccion || null,
            email: pedido.cliente_email || null
        },
        lines: buildKitchenLines(pedido.articulos || []),
        meta: buildMeta()
    };
};

module.exports = { buildKitchenPayload };
