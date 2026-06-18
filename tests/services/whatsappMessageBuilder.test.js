const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildWhatsAppMessage,
    formatPedidoContenido,
    normalizeModalidad,
    isAliasTransferenciaValido,
    buildMessagePreviews,
    applyTemplate,
    resolveTemplate,
} = require('../../services/whatsappMessageBuilder');
const { DEFAULT_TEMPLATES } = require('../../services/whatsappTemplateDefaults');

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

test('formatPedidoContenido con extras y cantidad', () => {
    const text = formatPedidoContenido([
        {
            cantidad: 1,
            articulo_nombre: 'Hamburguesa',
            personalizaciones: JSON.stringify({
                extras: [{ nombre: 'Extra cheddar', precio_extra: 350, cantidad: 2 }]
            }),
        },
    ]);
    assert.match(text, /1x Hamburguesa/);
    assert.match(text, /Extra cheddar x2/);
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

test('applyTemplate reemplaza placeholders conocidos', () => {
    const result = applyTemplate('Hola {{local}}, pedido #{{id}}\n{{contenido}}\n{{total}}', {
        local: 'Test',
        id: '99',
        contenido: '1x Pizza',
        total: '$ 1000',
    });
    assert.equal(result, 'Hola Test, pedido #99\n1x Pizza\n$ 1000');
});

test('buildWhatsAppMessage usa plantilla custom', () => {
    const customTemplate = 'Gracias {{local}}! Orden {{id}}\n{{contenido}}\nMonto: {{total}}\nNos vemos pronto.';
    const msg = buildWhatsAppMessage({
        ...BASE,
        medioPago: 'EFECTIVO',
        modalidad: 'RETIRO',
        plantillas: { EFECTIVO_RETIRO: customTemplate },
    });
    assert.match(msg, /Gracias El Chalito/);
    assert.match(msg, /Orden 42/);
    assert.match(msg, /Monto:.*5\.000/);
    assert.match(msg, /Nos vemos pronto/);
});

test('resolveTemplate usa default si plantilla vacia', () => {
    const resolved = resolveTemplate('EFECTIVO_RETIRO', { EFECTIVO_RETIRO: '' });
    assert.equal(resolved, DEFAULT_TEMPLATES.EFECTIVO_RETIRO);
});

test('resolveTemplate usa default si plantilla invalida', () => {
    const resolved = resolveTemplate('EFECTIVO_RETIRO', { EFECTIVO_RETIRO: 'sin placeholders' });
    assert.equal(resolved, DEFAULT_TEMPLATES.EFECTIVO_RETIRO);
});

test('buildMessagePreviews respeta plantillas custom', () => {
    const custom = 'Custom {{local}} #{{id}}\n{{contenido}}\n{{total}}\nFin.';
    const previews = buildMessagePreviews('Local Test', 'alias.test', {
        EFECTIVO_RETIRO: custom,
    });
    const efectivoRetiro = previews.find((p) => p.key === 'EFECTIVO_RETIRO');
    assert.match(efectivoRetiro.texto, /Custom Local Test #1234/);
    assert.match(efectivoRetiro.texto, /Fin\./);
});
