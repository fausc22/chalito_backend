const { mapExtrasNames } = require('./print/printPayloadShared');

const MAX_CONTENIDO_CHARS = 1200;
const ALIAS_PLACEHOLDER = 'ALIAS.NO.CONFIGURADO';

const PIES = {
    EFECTIVO_RETIRO:
        'Confirmamos tu pedido y ya lo estamos preparando. Te esperamos en el local para retirarlo. El pago es en efectivo al momento del retiro.',
    EFECTIVO_DELIVERY:
        'Confirmamos tu pedido y ya lo estamos preparando. El pago es en efectivo al recibirlo. El costo del envio lo cobra el cadete al momento de la entrega y no esta incluido en el total indicado arriba.',
    TRANSFERENCIA_RETIRO:
        'Para confirmar el pedido, transferi el total al alias {alias} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. Podes retirarlo en el local.',
    TRANSFERENCIA_DELIVERY:
        'Para confirmar el pedido, transferi el total al alias {alias} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. El envio lo coordina el cadete y su costo se abona aparte al momento de la entrega.',
    MERCADOPAGO_RETIRO:
        'Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. Te esperamos en el local para retirarlo.',
    MERCADOPAGO_DELIVERY:
        'Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. El costo del envio lo cobrara el cadete al momento de la entrega y no esta incluido en el total indicado arriba.',
};

const formatCurrencyArs = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
    }).format(amount);
};

const normalizeModalidad = (value) => {
    const normalized = String(value ?? 'RETIRO')
        .trim()
        .toUpperCase();
    if (normalized === 'DELIVERY') return 'DELIVERY';
    return 'RETIRO';
};

const normalizeMedioPago = (value) => {
    const normalized = String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    if (normalized === 'MERCADOPAGO' || normalized === 'MP') return 'MERCADOPAGO';
    if (normalized === 'TRANSFERENCIA') return 'TRANSFERENCIA';
    return 'EFECTIVO';
};

const formatItemLine = (item = {}) => {
    const cantidad = Number(item.cantidad) || 1;
    const nombre = String(item.articulo_nombre || item.nombre || 'Producto').trim();
    const extras = mapExtrasNames(item);
    const extrasText = extras.length ? ` (${extras.join(', ')})` : '';
    const obs = item.observaciones ? ` — ${String(item.observaciones).trim()}` : '';
    return `${cantidad}x ${nombre}${extrasText}${obs}`;
};

const formatPedidoContenido = (items = [], pedidoId = null) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        return '(Sin detalle de productos)';
    }

    let text = list.map(formatItemLine).join('\n');
    if (text.length <= MAX_CONTENIDO_CHARS) {
        return text;
    }

    const suffix = pedidoId
        ? `... (ver pedido #${pedidoId} en el local)`
        : '... (detalle abreviado)';
    const maxBody = MAX_CONTENIDO_CHARS - suffix.length - 1;
    return `${text.slice(0, maxBody).trim()}\n${suffix}`;
};

const resolvePie = (medioPago, modalidad, alias) => {
    const key = `${medioPago}_${modalidad}`;
    const template = PIES[key] || PIES.EFECTIVO_RETIRO;
    if (medioPago === 'TRANSFERENCIA') {
        return template.replace('{alias}', String(alias || ALIAS_PLACEHOLDER).trim());
    }
    return template;
};

const buildWhatsAppMessage = ({
    medioPago,
    modalidad,
    id,
    items = [],
    total,
    local = 'El Chalito',
    alias = '',
}) => {
    const mp = normalizeMedioPago(medioPago);
    const mod = normalizeModalidad(modalidad);
    const nombreLocal = String(local || 'El Chalito').trim();
    const contenido = formatPedidoContenido(items, id);
    const totalFmt = formatCurrencyArs(total);
    const pie = resolvePie(mp, mod, alias);

    return [
        `¡Hola! Te saluda ${nombreLocal}.`,
        '',
        `Pedido #${id}`,
        '',
        contenido,
        '',
        `Total: ${totalFmt}`,
        '',
        pie,
    ].join('\n');
};

const isAliasTransferenciaValido = (alias) => {
    const trimmed = String(alias ?? '').trim();
    return trimmed.length > 0 && trimmed.toUpperCase() !== ALIAS_PLACEHOLDER;
};

const MOCK_ITEMS = [
    {
        cantidad: 2,
        articulo_nombre: 'Milanesa napolitana',
        personalizaciones: { extras: [{ nombre: 'Papas fritas' }] },
    },
    { cantidad: 1, articulo_nombre: 'Gaseosa 1.5L' },
];

const buildMessagePreviews = (local = 'El Chalito', alias = 'elchalito.mp') => {
    const base = { id: 1234, items: MOCK_ITEMS, total: 18500, local, alias };
    return [
        {
            key: 'EFECTIVO_RETIRO',
            label: 'Efectivo — Retiro en local',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'EFECTIVO', modalidad: 'RETIRO', alias: '' }),
        },
        {
            key: 'EFECTIVO_DELIVERY',
            label: 'Efectivo — Envío a domicilio',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'EFECTIVO', modalidad: 'DELIVERY', alias: '' }),
        },
        {
            key: 'TRANSFERENCIA_RETIRO',
            label: 'Transferencia — Retiro en local',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'TRANSFERENCIA', modalidad: 'RETIRO' }),
        },
        {
            key: 'TRANSFERENCIA_DELIVERY',
            label: 'Transferencia — Envío a domicilio',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'TRANSFERENCIA', modalidad: 'DELIVERY' }),
        },
        {
            key: 'MERCADOPAGO_RETIRO',
            label: 'Mercado Pago — Retiro en local',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'MERCADOPAGO', modalidad: 'RETIRO', alias: '' }),
        },
        {
            key: 'MERCADOPAGO_DELIVERY',
            label: 'Mercado Pago — Envío a domicilio',
            texto: buildWhatsAppMessage({ ...base, medioPago: 'MERCADOPAGO', modalidad: 'DELIVERY', alias: '' }),
        },
    ];
};

module.exports = {
    PIES,
    ALIAS_PLACEHOLDER,
    formatCurrencyArs,
    normalizeModalidad,
    normalizeMedioPago,
    formatPedidoContenido,
    buildWhatsAppMessage,
    isAliasTransferenciaValido,
    buildMessagePreviews,
};
