const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCodigo,
    calcularMontoDescuento,
} = require('../../services/couponService');

test('normalizeCodigo recorta espacios y pasa a mayúsculas', () => {
    assert.equal(normalizeCodigo('  verano 10 '), 'VERANO10');
    assert.equal(normalizeCodigo(''), '');
});

test('calcularMontoDescuento porcentaje', () => {
    const cupon = { tipo: 'porcentaje', valor: 10 };
    assert.equal(calcularMontoDescuento(cupon, 15000), 1500);
});

test('calcularMontoDescuento porcentaje tope 100%', () => {
    const cupon = { tipo: 'porcentaje', valor: 150 };
    assert.equal(calcularMontoDescuento(cupon, 1000), 1000);
});

test('calcularMontoDescuento monto fijo no supera subtotal', () => {
    const cupon = { tipo: 'monto_fijo', valor: 5000 };
    assert.equal(calcularMontoDescuento(cupon, 3000), 3000);
    assert.equal(calcularMontoDescuento(cupon, 10000), 5000);
});

test('calcularMontoDescuento con subtotal cero', () => {
    const cupon = { tipo: 'porcentaje', valor: 10 };
    assert.equal(calcularMontoDescuento(cupon, 0), 0);
});
