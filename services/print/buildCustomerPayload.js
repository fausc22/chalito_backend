/**
 * PrintPayload v1 — ticket de cliente (58mm, con precios)
 */

const { calcularTotalesDesdePrecioFinal } = require('../totalesPrecioFinal');
const {
    PRINT_PAYLOAD_VERSION,
    PAPER_WIDTH_MM,
    formatFechaHora,
    getBusinessBlockAsync,
    buildMeta
} = require('./printPayloadShared');

const formatMedioPago = (medio) => {
    const m = String(medio || 'EFECTIVO').trim().toUpperCase();
    const labels = {
        EFECTIVO: 'Efectivo',
        DEBITO: 'Débito',
        CREDITO: 'Crédito',
        TRANSFERENCIA: 'Transferencia',
        MERCADOPAGO: 'Mercado Pago'
    };
    return labels[m] || m;
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

    const tieneCae = Boolean(venta.cae_id) && venta.tipo_factura === 'B';
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
            invoiceType: venta.tipo_factura || null
        },
        customer: {
            name: venta.cliente_nombre || 'Cliente',
            phone: venta.cliente_telefono || null,
            address: venta.cliente_direccion || null,
            email: venta.cliente_email || null
        },
        lines,
        totals: {
            subtotal: totalesVenta.subtotal,
            tax: totalesVenta.iva_total,
            discount: descuento,
            total: totalesVenta.total,
            paymentMethod: formatMedioPago(venta.medio_pago)
        },
        meta: buildMeta()
    };

    if (tieneCae) {
        const cuitEmisor = String(process.env.AFIP_CUIT || process.env.CUIT_NEGOCIO || '').replace(/\D/g, '');
        const fechaVenta = venta.fecha ? new Date(venta.fecha) : new Date();
        const fechaQr = fechaVenta.toISOString().slice(0, 10);
        payload.fiscal = {
            isElectronic: true,
            invoiceType: 'B',
            pointOfSale: puntoVenta,
            voucherNumber,
            voucherLabel: venta.numero_factura || null,
            cae: venta.cae_id,
            caeExpiresAt: venta.cae_fecha || null,
            caeEstado: venta.cae_estado || 'OK',
            tipoCmp: 6,
            cuitEmisor,
            fechaQr,
            importe: totalesVenta.total
        };
    } else if (venta.cae_estado === 'PENDIENTE') {
        payload.fiscal = {
            isElectronic: false,
            caeEstado: 'PENDIENTE',
            pendingMessage: 'CAE pendiente de autorización ARCA'
        };
    }

    return payload;
};

module.exports = { buildCustomerPayload };
