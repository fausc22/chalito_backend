const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Evitar conexión MySQL en tests de payload (branding)
require.cache[require.resolve('../services/brandingSettingsService')] = {
    id: require.resolve('../services/brandingSettingsService'),
    filename: require.resolve('../services/brandingSettingsService'),
    loaded: true,
    exports: {
        getSettings: async () => ({ nombreNegocio: 'El Chalito Test' })
    }
};

const { buildKitchenPayload } = require('../services/print/buildKitchenPayload');
const { buildCustomerPayload } = require('../services/print/buildCustomerPayload');
const { mapPrintError, PrintErrorCodes, mapExtrasNames } = require('../services/print/printPayloadShared');

describe('buildKitchenPayload', () => {
    it('genera PrintPayload v1 sin precios en líneas', async () => {
        const payload = await buildKitchenPayload({
            id: 256,
            fecha: '2026-05-19T14:00:00.000Z',
            modalidad: 'DELIVERY',
            estado_pago: 'PENDIENTE',
            estado: 'RECIBIDO',
            total: 8500,
            cliente_nombre: 'Juan Pérez',
            cliente_telefono: '1112345678',
            cliente_direccion: 'Calle 123',
            observaciones: 'Timbre roto',
            horario_entrega: '2026-05-19T17:30:00.000Z',
            articulos: [
                {
                    articulo_id: 1,
                    articulo_nombre: 'Mila napo',
                    cantidad: 2,
                    observaciones: 'sin sal',
                    personalizaciones: JSON.stringify({
                        extras: [{ nombre: 'cheddar', precio_extra: 500 }]
                    })
                }
            ]
        });

        assert.equal(payload.version, 1);
        assert.equal(payload.kind, 'kitchen');
        assert.equal(payload.paperWidthMm, 58);
        assert.ok(payload.scheduledLabel === undefined);
        assert.ok(payload.order.scheduledLabel);
        assert.equal(payload.totals, undefined);
        assert.equal(payload.lines.length, 1);
        assert.equal(payload.lines[0].qty, 2);
        assert.ok(!('unitPrice' in payload.lines[0]));
        assert.ok(!('lineTotal' in payload.lines[0]));
        assert.deepEqual(payload.lines[0].modifiers, ['cheddar']);
        assert.equal(payload.lines[0].lineNote, 'sin sal');
        assert.equal(payload.order.paymentStatus, 'PENDIENTE');
        assert.equal(payload.order.total, 8500);
        assert.equal(payload.order.totalLabel, '$8.500');
        assert.equal(payload.order.modalityLabel, 'ENVIO / DELIVERY');
        assert.equal(payload.order.orderNotes, 'Timbre roto');
        assert.ok(!String(payload.order.scheduledLabel).includes('PARA'));
    });

    it('genera modifiers con cantidad xN en cocina', async () => {
        const payload = await buildKitchenPayload({
            id: 300,
            fecha: '2026-05-19T14:00:00.000Z',
            modalidad: 'RETIRO',
            estado_pago: 'PENDIENTE',
            estado: 'RECIBIDO',
            total: 4200,
            cliente_nombre: 'Ana',
            articulos: [
                {
                    articulo_id: 1,
                    articulo_nombre: 'Burger',
                    cantidad: 1,
                    personalizaciones: JSON.stringify({
                        extras: [{ nombre: 'Extra cheddar', precio_extra: 350, cantidad: 2 }]
                    })
                }
            ]
        });

        assert.deepEqual(payload.lines[0].modifiers, ['Extra cheddar x2']);
    });
});

describe('buildCustomerPayload', () => {
    it('incluye totales y precios por línea', async () => {
        const payload = await buildCustomerPayload(
            { id: 10 },
            {
                id: 99,
                fecha: '2026-05-19T15:00:00.000Z',
                total: 5000,
                subtotal: 5000,
                descuento: 0,
                medio_pago: 'EFECTIVO',
                cliente_nombre: 'María',
                cliente_telefono: null,
                cliente_direccion: null,
                cliente_email: null,
                tipo_factura: null
            },
            [
                {
                    articulo_id: 1,
                    articulo_nombre: 'Empanada',
                    cantidad: 3,
                    precio: 1000,
                    subtotal: 3000
                }
            ]
        );

        assert.equal(payload.kind, 'customer');
        assert.ok(payload.totals);
        assert.equal(typeof payload.totals.total, 'number');
        assert.equal(payload.lines[0].unitPrice, 1000);
        assert.equal(payload.lines[0].lineTotal, 3000);
        assert.equal(payload.order.saleId, 99);
    });

    it('Factura C sin desglose IVA y con bloque fiscal', async () => {
        const payload = await buildCustomerPayload(
            { id: 10 },
            {
                id: 100,
                fecha: '2026-05-19T15:00:00.000Z',
                total: 1210,
                subtotal: 1210,
                descuento: 0,
                medio_pago: 'DEBITO',
                cliente_nombre: 'Cliente',
                tipo_factura: 'C',
                cae_id: '12345678901234',
                cae_estado: 'OK',
                cae_fecha: '2026-05-26',
                numero_factura: 'C 0001-00000123',
                punto_venta: 1
            },
            [
                {
                    articulo_id: 1,
                    articulo_nombre: 'Empanada',
                    cantidad: 1,
                    precio: 1210,
                    subtotal: 1210
                }
            ]
        );

        assert.equal(payload.order.invoiceType, 'C');
        assert.equal(payload.totals.hideTaxBreakdown, true);
        assert.equal(payload.totals.tax, 0);
        assert.equal(payload.totals.subtotal, payload.totals.total);
        assert.ok(payload.fiscal);
        assert.equal(payload.fiscal.tipoCmp, 11);
        assert.equal(payload.fiscal.invoiceType, 'C');
    });
});

describe('mapExtrasNames', () => {
    it('muestra nombre simple si cantidad es 1 o ausente', () => {
        const names = mapExtrasNames({
            personalizaciones: {
                extras: [{ nombre: 'Extra cheddar', precio_extra: 350 }]
            }
        });
        assert.deepEqual(names, ['Extra cheddar']);
    });

    it('muestra Extra cheddar x2 si cantidad > 1', () => {
        const names = mapExtrasNames({
            personalizaciones: {
                extras: [{ nombre: 'Extra cheddar', precio_extra: 350, cantidad: 2 }]
            }
        });
        assert.deepEqual(names, ['Extra cheddar x2']);
    });
});

describe('mapPrintError', () => {
    it('mapea pedido no encontrado', () => {
        const r = mapPrintError(new Error('Pedido 1 no encontrado'));
        assert.equal(r.code, PrintErrorCodes.PEDIDO_NOT_FOUND);
        assert.equal(r.status, 404);
    });

    it('mapea pedido no pagado', () => {
        const r = mapPrintError(new Error('El pedido 1 no está pagado. Estado actual: DEBE'));
        assert.equal(r.code, PrintErrorCodes.PEDIDO_NOT_PAID);
    });

    it('mapea pedido no entregado', () => {
        const r = mapPrintError(new Error('El pedido 1 no está entregado. La factura ARCA solo puede imprimirse cuando el pedido está ENTREGADO.'));
        assert.equal(r.code, PrintErrorCodes.PEDIDO_NO_ENTREGADO);
    });

    it('mapea CAE pendiente', () => {
        const r = mapPrintError(new Error('CAE pendiente de autorización ARCA para el pedido 1. Reintentá en unos minutos.'));
        assert.equal(r.code, PrintErrorCodes.CAE_PENDIENTE);
    });
});
