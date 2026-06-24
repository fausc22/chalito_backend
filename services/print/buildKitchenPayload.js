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
const { aplicaEnvioGratis } = require('../envioGratisSettingsService');

const SIMPLE_LABEL_KEYWORDS = ['hambur', 'burger'];

const hasDobleTripleModifier = (modifiers = []) =>
    modifiers.some((modifier) => /doble|triple/i.test(String(modifier ?? '')));

const shouldAddSimpleLabel = (name, modifiers = []) => {
    const normalizedName = String(name ?? '').toLowerCase();
    const matchesKeyword = SIMPLE_LABEL_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
    return matchesKeyword && !hasDobleTripleModifier(modifiers);
};

const buildKitchenLines = (articulos = []) =>
    articulos.map((articulo) => {
        const name = articulo.articulo_nombre || articulo.nombre || 'Artículo';
        const modifiers = mapExtrasNames(articulo);
        const finalModifiers = shouldAddSimpleLabel(name, modifiers)
            ? ['SIMPLE', ...modifiers]
            : modifiers;

        return {
            qty: articulo.cantidad || 1,
            name,
            modifiers: finalModifiers,
            lineNote: articulo.observaciones || null
        };
    });

/**
 * @param {Object} pedido - fila pedidos + articulos[]
 */
const buildKitchenPayload = async (pedido) => {
    const scheduledLabel = buildScheduledLabel(pedido);
    const modality = normalizeModality(pedido.modalidad);
    const total = parseFloat(pedido.total);
    const business = await getBusinessBlockAsync();
    const envioGratis = await aplicaEnvioGratis({
        total: Number.isFinite(total) ? total : 0,
        modalidad: pedido.modalidad,
    });

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
            orderNotes: pedido.observaciones || null,
            envioGratis,
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

module.exports = { buildKitchenPayload, shouldAddSimpleLabel };
