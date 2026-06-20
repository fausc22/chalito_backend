const whatsappSettingsService = require('./whatsappSettingsService');
const { loadPedidoContenidoForWhatsApp } = require('./pedidoContenidoLoader');
const { mapExtrasNames } = require('./print/printPayloadShared');
const { resolveNumeroContacto } = require('./whatsappContactResolver');
const { normalizeWaMeNumber, normalizePhoneArgentina } = require('./whatsappPhoneUtils');
const {
    formatCurrencyArs,
    normalizeMedioPago,
    normalizeModalidad,
    isAliasTransferenciaValido,
    buildTemplateKey,
} = require('./whatsappMessageBuilder');
const {
    DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    DEFAULT_TEMPLATES_CLIENTE_LOCAL,
    REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL,
    CLIENTE_AL_LOCAL_PLACEHOLDERS,
} = require('./whatsappTemplateDefaults');
const { isClienteLocalTemplateValid } = require('./whatsappTemplateValidator');

function getDb() {
    return require('../controllers/dbPromise');
}

const MAX_WA_ME_URL_LENGTH = 2000;
const MAX_CONTENIDO_CHARS = 1200;
const ALIAS_PLACEHOLDER = 'ALIAS.NO.CONFIGURADO';

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return defaultValue;
};

const resolveTemplateClienteAlLocal = (dbValue) => {
    const trimmed = String(dbValue ?? '').trim();
    if (!trimmed) {
        return DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL;
    }

    const missing = REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL.filter(
        (key) => !trimmed.includes(`{{${key}}}`)
    );
    if (missing.length > 0) {
        console.warn(
            `[WA] Plantilla cliente->local inválida (faltan ${missing.join(', ')}), usando default`
        );
        return DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL;
    }

    return trimmed;
};

const resolveClienteLocalTemplateForPedido = (templateKey, settings) => {
    const fromNew = String(settings.plantillasClienteLocal?.[templateKey] ?? '').trim();
    if (fromNew && isClienteLocalTemplateValid(fromNew)) {
        return fromNew;
    }

    const legacy = resolveTemplateClienteAlLocal(settings.templateClienteAlLocal);
    if (legacy && isClienteLocalTemplateValid(legacy)) {
        return legacy;
    }

    return DEFAULT_TEMPLATES_CLIENTE_LOCAL[templateKey] || DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL;
};

const parseDireccionPedido = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) {
        return { lines: [] };
    }

    if (!text.includes('|')) {
        return { lines: [`Entregar en ${text}`] };
    }

    const map = {};
    for (const part of text.split('|')) {
        const trimmed = part.trim();
        const idx = trimmed.indexOf(':');
        if (idx > 0) {
            map[trimmed.slice(0, idx).trim().toLowerCase()] = trimmed.slice(idx + 1).trim();
        }
    }

    const calle = map.calle || '';
    const altura = map.altura || '';
    const entreCalles = map['entre calles'] || '';
    const edificio = map['edificio/casa'] || map.edificio || '';
    const piso = map['piso/depto'] || map.piso || '';
    const lines = [];

    if (calle && altura) {
        lines.push(`Entregar en Calle ${calle} número ${altura}`);
    } else if (text) {
        lines.push(`Entregar en ${text.replace(/\s*\|\s*/g, ', ')}`);
    }

    if (entreCalles) {
        lines.push(`Entre calles: ${entreCalles}`);
    }
    if (edificio) {
        lines.push(`Edificio/Casa: ${edificio}`);
    }
    if (piso) {
        lines.push(`Piso/Depto: ${piso}`);
    }

    return { lines };
};

const buildBloqueRetiro = (pedido) => {
    const mod = normalizeModalidad(pedido.modalidad);
    if (mod !== 'RETIRO') {
        return '';
    }
    return 'Retiro en el local.\n';
};

const buildBloqueEntrega = (pedido) => {
    const mod = normalizeModalidad(pedido.modalidad);
    if (mod !== 'DELIVERY') {
        return '';
    }

    const { lines } = parseDireccionPedido(pedido.cliente_direccion);
    const observaciones = String(pedido.observaciones ?? '').trim();
    const allLines = [...lines];

    if (observaciones) {
        allLines.push(observaciones);
    }

    if (allLines.length === 0) {
        return '';
    }

    return `${allLines.join('\n')}\n`;
};

const formatHorarioEntrega = (horarioEntrega) => {
    if (!horarioEntrega) {
        return '';
    }

    const date = horarioEntrega instanceof Date ? horarioEntrega : new Date(horarioEntrega);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const buildBloqueHorario = (pedido) => {
    const horario = formatHorarioEntrega(pedido.horario_entrega);
    if (!horario) {
        return '';
    }
    return `Entrega programada para: ${horario}\n`;
};

const buildBloqueDescuento = (pedido) => {
    const descuento = Number(pedido.descuento_cupon) || 0;
    const cupon = String(pedido.cupon_codigo ?? '').trim();
    if (descuento <= 0) {
        return '';
    }

    const cuponText = cupon ? `Cupón ${cupon}: ` : 'Descuento: ';
    return `${cuponText}-${formatCurrencyArs(descuento)}\n`;
};

const buildBloqueAbono = (pedido) => {
    const medioPago = normalizeMedioPago(pedido.medio_pago);
    if (medioPago !== 'EFECTIVO') {
        return '';
    }

    const monto = Number(pedido.monto_con_cuanto_abona);
    if (!Number.isFinite(monto) || monto <= 0) {
        return '';
    }

    return `Abono con: ${formatCurrencyArs(monto)}\n`;
};

const buildBloqueTransferencia = (pedido, aliasTransferencia) => {
    const medioPago = normalizeMedioPago(pedido.medio_pago);
    if (medioPago !== 'TRANSFERENCIA') {
        return '';
    }

    const alias = String(aliasTransferencia ?? '').trim();
    if (!isAliasTransferenciaValido(alias)) {
        return 'Transferencia bancaria (consultar alias con el local).\n';
    }

    return `Alias para transferir: ${alias}\n`;
};

const buildBloqueMercadoPago = (pedido) => {
    const medioPago = normalizeMedioPago(pedido.medio_pago);
    if (medioPago !== 'MERCADOPAGO') {
        return '';
    }

    const estadoPago = String(pedido.estado_pago ?? '').trim().toUpperCase();
    if (estadoPago === 'PAGADO') {
        return 'Pago acreditado con Mercado Pago.\n';
    }

    return '';
};

const formatClienteAlLocalItemLine = (item = {}) => {
    const cantidad = Number(item.cantidad) || 1;
    const nombre = String(item.articulo_nombre || item.nombre || 'Producto').trim();
    const extras = mapExtrasNames(item);
    const nombreCompleto = extras.length ? `${nombre} ${extras.join(' ')}` : nombre;
    const obs = String(item.observaciones ?? '').trim();
    const obsText = obs ? ` — ${obs}` : '';
    const lineSubtotal = Number(item.subtotal);
    const lineTotal = Number.isFinite(lineSubtotal)
        ? lineSubtotal
        : (Number(item.precio) || 0) * cantidad;

    return `✅ ${cantidad} x ${nombreCompleto}${obsText}  (${formatCurrencyArs(lineTotal)})`;
};

const formatContenidoClienteAlLocal = (items = [], pedidoId = null) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        return '(Sin detalle de productos)';
    }

    let text = list.map(formatClienteAlLocalItemLine).join('\n');
    if (text.length <= MAX_CONTENIDO_CHARS) {
        return text;
    }

    const suffix = pedidoId
        ? `... (ver pedido #${pedidoId} en el local)`
        : '... (detalle abreviado)';
    const maxBody = MAX_CONTENIDO_CHARS - suffix.length - 1;
    return `${text.slice(0, maxBody).trim()}\n${suffix}`;
};

const formatCodigoPedido = (pedidoId) => `WEB-${pedidoId}`;

const resolveAliasParaMensaje = (aliasTransferencia) => {
    const alias = String(aliasTransferencia ?? '').trim();
    if (isAliasTransferenciaValido(alias)) {
        return alias;
    }
    return '';
};

const applyClienteAlLocalTemplate = (template, vars = {}) => {
    let result = String(template ?? '');
    for (const key of CLIENTE_AL_LOCAL_PLACEHOLDERS) {
        const token = `{{${key}}}`;
        const value = vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
        result = result.split(token).join(value);
    }
    return result;
};

const buildClienteAlLocalMessage = ({
    template,
    pedido,
    items,
    nombreNegocio,
    aliasTransferencia,
}) => {
    const contenido = formatContenidoClienteAlLocal(items, pedido.id);
    const alias = resolveAliasParaMensaje(aliasTransferencia);
    const horario = formatHorarioEntrega(pedido.horario_entrega);
    const descuentoMonto = Number(pedido.descuento_cupon) || 0;
    const cupon = String(pedido.cupon_codigo ?? '').trim();

    const vars = {
        id: String(pedido.id),
        contenido,
        subtotal: formatCurrencyArs(pedido.subtotal ?? pedido.total),
        total: formatCurrencyArs(pedido.total),
        cliente: String(pedido.cliente_nombre || 'Cliente').trim(),
        telefono: normalizePhoneArgentina(pedido.cliente_telefono) || String(pedido.cliente_telefono || '').trim(),
        modalidad: normalizeModalidad(pedido.modalidad),
        medio_pago: normalizeMedioPago(pedido.medio_pago),
        bloque_retiro: buildBloqueRetiro(pedido),
        bloque_entrega: buildBloqueEntrega(pedido),
        bloque_horario: buildBloqueHorario(pedido),
        bloque_descuento: buildBloqueDescuento(pedido),
        bloque_abono: buildBloqueAbono(pedido),
        bloque_transferencia: buildBloqueTransferencia(pedido, aliasTransferencia),
        bloque_mercadopago: buildBloqueMercadoPago(pedido),
        alias,
        cupon,
        descuento: descuentoMonto > 0 ? formatCurrencyArs(descuentoMonto) : '',
        horario,
        codigo_pedido: formatCodigoPedido(pedido.id),
        local: String(nombreNegocio || 'El Chalito').trim(),
    };

    return applyClienteAlLocalTemplate(template, vars);
};

const buildWaMeUrl = (numero, mensaje) => {
    const encoded = encodeURIComponent(mensaje);
    const url = `https://wa.me/${numero}?text=${encoded}`;
    if (url.length > MAX_WA_ME_URL_LENGTH) {
        const maxMsgChars = Math.max(
            200,
            MAX_WA_ME_URL_LENGTH - `https://wa.me/${numero}?text=`.length - 80
        );
        const truncated = `${mensaje.slice(0, maxMsgChars).trim()}\n\n(Ver pedido completo en el local)`;
        return `https://wa.me/${numero}?text=${encodeURIComponent(truncated)}`;
    }
    return url;
};

async function loadPedidoWebParaWhatsAppCliente(pedidoId) {
    const db = getDb();
    const [rows] = await db.execute(
        `SELECT id, origen_pedido, medio_pago, estado_pago, modalidad,
                cliente_nombre, cliente_direccion, cliente_telefono,
                subtotal, total, observaciones, monto_con_cuanto_abona,
                horario_entrega, cupon_codigo, descuento_cupon
         FROM pedidos
         WHERE id = ?
         LIMIT 1`,
        [pedidoId]
    );

    if (!rows.length) {
        return null;
    }

    const pedido = rows[0];
    if (String(pedido.origen_pedido || '').trim().toUpperCase() !== 'WEB') {
        return null;
    }

    const items = await loadPedidoContenidoForWhatsApp(pedidoId);
    return { pedido, items };
}

async function obtenerWhatsAppClienteParaPedido(pedidoId) {
    const settings = await whatsappSettingsService.getSettings();
    const activo = parseBoolean(settings.clienteEnviaAlLocal, false);

    if (!activo) {
        return { activo: false };
    }

    const pedidoData = await loadPedidoWebParaWhatsAppCliente(pedidoId);
    if (!pedidoData) {
        return { activo: false, motivo: 'pedido_no_encontrado' };
    }

    const { pedido, items } = pedidoData;
    const medioPago = normalizeMedioPago(pedido.medio_pago);
    const estadoPago = String(pedido.estado_pago || '').trim().toUpperCase();

    if (medioPago === 'MERCADOPAGO' && estadoPago !== 'PAGADO') {
        return { activo: false, motivo: 'pago_pendiente' };
    }

    const numero = resolveNumeroContacto(settings.numeroContacto);
    if (!numero) {
        return { activo: false, motivo: 'sin_numero' };
    }

    const templateKey = buildTemplateKey(medioPago, pedido.modalidad);
    const template = resolveClienteLocalTemplateForPedido(templateKey, settings);
    const mensaje = buildClienteAlLocalMessage({
        template,
        pedido,
        items,
        nombreNegocio: settings.nombreNegocio,
        aliasTransferencia: settings.aliasTransferencia,
    });
    const urlWaMe = buildWaMeUrl(numero, mensaje);

    return {
        activo: true,
        pedidoId: pedido.id,
        numero,
        mensaje,
        urlWaMe,
    };
}

module.exports = {
    normalizeWaMeNumber,
    resolveNumeroContacto,
    resolveTemplateClienteAlLocal,
    resolveClienteLocalTemplateForPedido,
    buildBloqueRetiro,
    buildBloqueEntrega,
    buildBloqueHorario,
    buildBloqueDescuento,
    buildBloqueAbono,
    buildBloqueTransferencia,
    buildBloqueMercadoPago,
    formatContenidoClienteAlLocal,
    buildClienteAlLocalMessage,
    buildWaMeUrl,
    obtenerWhatsAppClienteParaPedido,
};
