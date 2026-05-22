const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildWhatsAppMessage,
    formatPedidoContenido,
    normalizeModalidad,
    isAliasTransferenciaValido,
    buildMessagePreviews,
} = require('../../services/whatsappMessageBuilder');

const BASE = {
    id: 42,
    local: 'El Chalito',
    total: 5000,
    alias: 'elchalito.mp',
    items: [{ cantidad: 1, articulo_nombre: 'Empanada' }],
};

test('normalizeModalidad acepta DELIVERY y RETIRO', () => {
    assert.equal(normalizeModalidad('delivery'), 'DELIVERY');
    assert.equal(normalizeModalidad('RETIRO'), 'RETIRO');
    assert.equal(normalizeModalidad(null), 'RETIRO');
});

test('mensaje incluye saludo, id, contenido y total', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'EFECTIVO', modalidad: 'RETIRO' });
    assert.match(msg, /¡Hola! Te saluda El Chalito/);
    assert.match(msg, /Pedido #42/);
    assert.match(msg, /1x Empanada/);
    assert.match(msg, /Total:.*5\.000/);
});

test('EFECTIVO RETIRO no menciona cadete', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'EFECTIVO', modalidad: 'RETIRO' });
    assert.doesNotMatch(msg, /cadete/i);
    assert.match(msg, /retirarlo/i);
});

test('EFECTIVO DELIVERY menciona cadete y envio', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'EFECTIVO', modalidad: 'DELIVERY' });
    assert.match(msg, /cadete/i);
    assert.match(msg, /envio/i);
});

test('TRANSFERENCIA incluye alias', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'TRANSFERENCIA', modalidad: 'RETIRO' });
    assert.match(msg, /elchalito\.mp/);
    assert.match(msg, /comprobante/i);
});

test('TRANSFERENCIA DELIVERY menciona envio aparte', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'TRANSFERENCIA', modalidad: 'DELIVERY' });
    assert.match(msg, /cadete/i);
});

test('MERCADOPAGO RETIRO confirma pago acreditado', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'MERCADOPAGO', modalidad: 'RETIRO' });
    assert.match(msg, /Mercado Pago/i);
    assert.match(msg, /acreditado/i);
    assert.match(msg, /local/i);
});

test('MERCADOPAGO DELIVERY menciona envio al entregar', () => {
    const msg = buildWhatsAppMessage({ ...BASE, medioPago: 'MERCADOPAGO', modalidad: 'DELIVERY' });
    assert.match(msg, /cadete/i);
});

test('formatPedidoContenido con extras', () => {
    const text = formatPedidoContenido([
        {
            cantidad: 2,
            articulo_nombre: 'Hamburguesa',
            personalizaciones: JSON.stringify({ extras: [{ nombre: 'Queso' }] }),
        },
    ]);
    assert.match(text, /2x Hamburguesa/);
    assert.match(text, /Queso/);
});

test('isAliasTransferenciaValido rechaza placeholder', () => {
    assert.equal(isAliasTransferenciaValido('elchalito.mp'), true);
    assert.equal(isAliasTransferenciaValido('ALIAS.NO.CONFIGURADO'), false);
    assert.equal(isAliasTransferenciaValido(''), false);
});

test('buildMessagePreviews devuelve 6 variantes', () => {
    const previews = buildMessagePreviews();
    assert.equal(previews.length, 6);
    assert.ok(previews.every((p) => p.key && p.label && p.texto));
});
