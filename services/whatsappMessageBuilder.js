const { mapExtrasNames } = require('./print/printPayloadShared');
const {
    TEMPLATE_KEYS,
    TEMPLATE_LABELS,
    DEFAULT_TEMPLATES,
    MOCK_ITEMS,
} = require('./whatsappTemplateDefaults');
const { isTemplateValid } = require('./whatsappTemplateValidator');

const MAX_CONTENIDO_CHARS = 1200;
const ALIAS_PLACEHOLDER = 'ALIAS.NO.CONFIGURADO';

const KNOWN_PLACEHOLDERS = ['id', 'contenido', 'total', 'local', 'alias'];

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

const applyTemplate = (template, vars = {}) => {
    let result = String(template ?? '');
    for (const key of KNOWN_PLACEHOLDERS) {
        const token = `{{${key}}}`;
        const value = vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
        result = result.split(token).join(value);
    }
    return result;
};

const resolveTemplate = (templateKey, plantillas = {}) => {
    const key = TEMPLATE_KEYS.includes(templateKey) ? templateKey : 'EFECTIVO_RETIRO';
    const candidate = plantillas[key];
    const trimmed = String(candidate ?? '').trim();

    if (trimmed && isTemplateValid(key, trimmed)) {
        return trimmed;
    }

    if (trimmed && !isTemplateValid(key, trimmed)) {
        console.warn(`[WA] Plantilla ${key} inválida en DB, usando default`);
    }

    return DEFAULT_TEMPLATES[key] || DEFAULT_TEMPLATES.EFECTIVO_RETIRO;
};

const buildTemplateKey = (medioPago, modalidad) =>
    `${normalizeMedioPago(medioPago)}_${normalizeModalidad(modalidad)}`;

const buildWhatsAppMessage = ({
    medioPago,
    modalidad,
    id,
    items = [],
    total,
    local = 'El Chalito',
    alias = '',
    plantillas = {},
}) => {
    const mp = normalizeMedioPago(medioPago);
    const mod = normalizeModalidad(modalidad);
    const templateKey = buildTemplateKey(mp, mod);
    const template = resolveTemplate(templateKey, plantillas);
    const contenido = formatPedidoContenido(items, id);
    const totalFmt = formatCurrencyArs(total);
    const nombreLocal = String(local || 'El Chalito').trim();

    return applyTemplate(template, {
        id: String(id),
        contenido,
        total: totalFmt,
        local: nombreLocal,
        alias: String(alias || ALIAS_PLACEHOLDER).trim(),
    });
};

const isAliasTransferenciaValido = (alias) => {
    const trimmed = String(alias ?? '').trim();
    return trimmed.length > 0 && trimmed.toUpperCase() !== ALIAS_PLACEHOLDER;
};

const parseTemplateKey = (key) => {
    const modalidad = key.endsWith('_DELIVERY') ? 'DELIVERY' : 'RETIRO';
    const medioPago = key.replace(/_(RETIRO|DELIVERY)$/, '');
    return { medioPago, modalidad };
};

const buildMessagePreviews = (local = 'El Chalito', alias = 'elchalito.mp', plantillas = {}) => {
    const base = { id: 1234, items: MOCK_ITEMS, total: 18500, local, alias, plantillas };
    return TEMPLATE_KEYS.map((key) => {
        const { medioPago, modalidad } = parseTemplateKey(key);
        return {
            key,
            label: TEMPLATE_LABELS[key],
            texto: buildWhatsAppMessage({
                ...base,
                medioPago,
                modalidad,
                alias: key.startsWith('TRANSFERENCIA_') ? alias : '',
            }),
        };
    });
};

module.exports = {
    ALIAS_PLACEHOLDER,
    KNOWN_PLACEHOLDERS,
    formatCurrencyArs,
    normalizeModalidad,
    normalizeMedioPago,
    formatPedidoContenido,
    applyTemplate,
    resolveTemplate,
    buildTemplateKey,
    buildWhatsAppMessage,
    isAliasTransferenciaValido,
    buildMessagePreviews,
};
