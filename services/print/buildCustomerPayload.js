/**
 * PrintPayload v1 — factura oficial ARCA (58mm, con precios y datos fiscales)
 */

const { calcularTotalesDesdePrecioFinal } = require('../totalesPrecioFinal');
const {
    PRINT_PAYLOAD_VERSION,
    PAPER_WIDTH_MM,
    formatFechaHora,
    getBusinessBlockAsync,
    buildMeta
} = require('./printPayloadShared');

const TIPO_CMP_FACTURA_B = 6;
const TIPO_CMP_FACTURA_C = 11;

const formatMedioPago = (medio) => {
    const m = String(medio || 'EFECTIVO').trim().toUpperCase();
    const labels = {
        EFECTIVO: 'Efectivo',
        DEBITO: 'Débito',
        CREDITO: 'Crédito',
        TRANSFERENCIA: 'Transferencia',
        TRANSFERENCIA_FACTURADA: 'Transferencia',
        MERCADOPAGO: 'Mercado Pago'
    };
    return labels[m] || m;
};

const resolverTipoCmp = (tipoFactura) => {
    const t = String(tipoFactura || 'C').trim().toUpperCase();
    if (t === 'B') return TIPO_CMP_FACTURA_B;
    return TIPO_CMP_FACTURA_C;
};

/**
 * @param {Object} pedido - fila pedidos
 * @param {Object} venta - fila ventas
 * @param {Array} articulosVenta - filas ventas_contenido
 */
const buildCustomerPayload = async (pedido, venta, articulosVenta) => {
    const totalVentaBase = parseFloat(venta.total);
    const subtotalVentaBase = parseFloat(venta.subtotal);
    const totalFinalVenta = Number.isFinite(totalVentaBase)
        ? totalVentaBase
        : (Number.isFinite(subtotalVentaBase) ? subtotalVentaBase : 0);
    const totalesVenta = calcularTotalesDesdePrecioFinal(totalFinalVenta);
    const descuento = parseFloat(venta.descuento || 0);
    const tipoFactura = String(venta.tipo_factura || 'C').trim().toUpperCase();
    const esFacturaC = tipoFactura === 'C';

    const lines = articulosVenta.map((articulo) => {
        const qty = articulo.cantidad || 1;
        const unitPrice = parseFloat(articulo.precio) || 0;
        const lineTotal = parseFloat(articulo.subtotal) || unitPrice * qty;
        return {
            qty,
            name: articulo.articulo_nombre || 'Producto',
            unitPrice,
            lineTotal,
            modifiers: [],
            lineNote: null
        };
    });

    const tieneCae = Boolean(venta.cae_id) && (tipoFactura === 'B' || tipoFactura === 'C');
    const puntoVenta = venta.punto_venta || parseInt(process.env.DEFAULT_PUNTO_VENTA, 10) || 1;
    let voucherNumber = null;
    if (venta.numero_factura) {
        const match = String(venta.numero_factura).match(/(\d{4})-(\d+)/);
        if (match) voucherNumber = parseInt(match[2], 10);
    }

    const business = await getBusinessBlockAsync();

    const payload = {
        version: PRINT_PAYLOAD_VERSION,
        kind: 'customer',
        paperWidthMm: PAPER_WIDTH_MM,
        business,
        order: {
            id: pedido.id,
            number: pedido.id,
            saleId: venta.id,
            saleNumber: venta.id,
            createdAt: venta.fecha,
            createdAtLabel: formatFechaHora(venta.fecha),
            invoiceType: tipoFactura
        },
        customer: {
            name: venta.cliente_nombre || 'Cliente',
            phone: venta.cliente_telefono || null,
            address: venta.cliente_direccion || null,
            email: venta.cliente_email || null
        },
        lines,
        totals: {
            subtotal: esFacturaC ? totalesVenta.total : totalesVenta.subtotal,
            tax: esFacturaC ? 0 : totalesVenta.iva_total,
            discount: descuento,
            total: totalesVenta.total,
            paymentMethod: formatMedioPago(venta.medio_pago),
            hideTaxBreakdown: esFacturaC
        },
        meta: buildMeta()
    };

    if (tieneCae) {
        const cuitEmisor = String(process.env.AFIP_CUIT || process.env.CUIT_NEGOCIO || '').replace(/\D/g, '');
        const fechaVenta = venta.fecha ? new Date(venta.fecha) : new Date();
        const fechaQr = fechaVenta.toISOString().slice(0, 10);
        const tipoCmp = resolverTipoCmp(tipoFactura);
        payload.fiscal = {
            isElectronic: true,
            invoiceType: tipoFactura,
            pointOfSale: puntoVenta,
            voucherNumber,
            voucherLabel: venta.numero_factura || null,
            cae: venta.cae_id,
            caeExpiresAt: venta.cae_fecha || null,
            caeEstado: venta.cae_estado || 'OK',
            tipoCmp,
            cuitEmisor,
            fechaQr,
            importe: totalesVenta.total
        };
    }

    return payload;
};

module.exports = { buildCustomerPayload };
