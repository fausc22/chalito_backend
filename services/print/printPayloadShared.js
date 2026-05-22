/**
 * Utilidades compartidas para PrintPayload v1
 */

const PRINT_PAYLOAD_VERSION = 1;
const PAPER_WIDTH_MM = 58;

const formatHora = (value) => {
    if (!value) return null;
    const fecha = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(fecha.getTime())) return null;
    return fecha.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

const formatFechaHora = (value) => {
    if (!value) return '';
    const fecha = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(fecha.getTime())) return '';
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    const horas = String(fecha.getHours()).padStart(2, '0');
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${año} ${horas}:${minutos}`;
};

const parsePersonalizaciones = (personalizaciones) => {
    if (!personalizaciones) return null;
    if (typeof personalizaciones === 'string') {
        try {
            return JSON.parse(personalizaciones);
        } catch (_) {
            return null;
        }
    }
    return typeof personalizaciones === 'object' ? personalizaciones : null;
};

const mapExtrasNames = (articulo = {}) => {
    const personalizaciones = parsePersonalizaciones(articulo.personalizaciones);
    if (!Array.isArray(personalizaciones?.extras)) return [];

    return personalizaciones.extras
        .map((extra = {}) => extra.nombre || extra.nombre_adicional || null)
        .filter(Boolean);
};

const buildScheduledLabel = (pedido) => {
    const horario =
        pedido.horario_entrega ||
        pedido.hora_entrega ||
        pedido.hora_programada ||
        pedido.hora_esperada_finalizacion;

    if (horario) {
        const hhmm = formatHora(horario);
        return hhmm ? `PARA ${hhmm}` : 'CUANTO ANTES';
    }
    return 'CUANTO ANTES';
};

const normalizeModality = (modalidad) => {
    const m = String(modalidad || 'RETIRO').trim().toUpperCase();
    if (m === 'DELIVERY' || m === 'ENVIO' || m === 'ENVÍO') return 'DELIVERY';
    return 'RETIRO';
};

const normalizePaymentStatus = (estadoPago) => {
    const e = String(estadoPago || 'PENDIENTE').trim().toUpperCase();
    return e === 'PAGADO' || e === 'PAID' ? 'PAGADO' : 'PENDIENTE';
};

const getBusinessBlockSync = () => ({
    name: process.env.NOMBRE_NEGOCIO || 'El Chalito',
    address: process.env.DIRECCION_NEGOCIO || '',
    phone: process.env.TELEFONO_NEGOCIO || '',
    taxId: process.env.CUIT_NEGOCIO || ''
});

const getBusinessBlockAsync = async () => {
    try {
        const brandingSettingsService = require('../brandingSettingsService');
        const settings = await brandingSettingsService.getSettings();
        return {
            name: settings.nombreNegocio || process.env.NOMBRE_NEGOCIO || 'El Chalito',
            address: process.env.DIRECCION_NEGOCIO || '',
            phone: process.env.TELEFONO_NEGOCIO || '',
            taxId: process.env.CUIT_NEGOCIO || ''
        };
    } catch (error) {
        console.warn('getBusinessBlockAsync fallback env:', error.message);
        return getBusinessBlockSync();
    }
};

const buildMeta = () => ({
    source: 'el-chalito',
    generatedAt: new Date().toISOString()
});

/** Códigos de error estables para la API de impresión */
const PrintErrorCodes = {
    PEDIDO_NOT_FOUND: 'PEDIDO_NOT_FOUND',
    PEDIDO_NO_ITEMS: 'PEDIDO_NO_ITEMS',
    PEDIDO_NOT_PAID: 'PEDIDO_NOT_PAID',
    NO_SALE_FOR_TICKET: 'NO_SALE_FOR_TICKET',
    SALE_NO_ITEMS: 'SALE_NO_ITEMS',
    PRINT_DATA_ERROR: 'PRINT_DATA_ERROR'
};

const mapPrintError = (error) => {
    const msg = error?.message || '';
    if (msg.includes('no encontrado')) {
        return { code: PrintErrorCodes.PEDIDO_NOT_FOUND, message: msg, status: 404 };
    }
    if (msg.includes('no tiene artículos')) {
        return { code: PrintErrorCodes.PEDIDO_NO_ITEMS, message: msg, status: 400 };
    }
    if (msg.includes('no está pagado')) {
        return { code: PrintErrorCodes.PEDIDO_NOT_PAID, message: msg, status: 400 };
    }
    if (msg.includes('No existe una venta')) {
        return { code: PrintErrorCodes.NO_SALE_FOR_TICKET, message: msg, status: 400 };
    }
    if (msg.includes('venta') && msg.includes('no tiene artículos')) {
        return { code: PrintErrorCodes.SALE_NO_ITEMS, message: msg, status: 400 };
    }
    return { code: PrintErrorCodes.PRINT_DATA_ERROR, message: msg || 'Error al preparar datos de impresión', status: 500 };
};

module.exports = {
    PRINT_PAYLOAD_VERSION,
    PAPER_WIDTH_MM,
    formatHora,
    formatFechaHora,
    mapExtrasNames,
    buildScheduledLabel,
    normalizeModality,
    normalizePaymentStatus,
    getBusinessBlock: getBusinessBlockSync,
    getBusinessBlockAsync,
    buildMeta,
    PrintErrorCodes,
    mapPrintError
};
