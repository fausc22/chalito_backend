const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FondosArcaRouting = require('../services/FondosArcaRoutingService');

describe('FondosArcaRoutingService', () => {
  it('normaliza medios de pago', () => {
    assert.equal(FondosArcaRouting.normalizarMedioPago(' mercadopago '), 'MERCADOPAGO');
    assert.equal(FondosArcaRouting.normalizarMedioPago('efectivo'), 'EFECTIVO');
  });

  it('requiereArca para MP, tarjetas y transferencia facturada', () => {
    assert.equal(FondosArcaRouting.requiereArca('MERCADOPAGO'), true);
    assert.equal(FondosArcaRouting.requiereArca('DEBITO'), true);
    assert.equal(FondosArcaRouting.requiereArca('CREDITO'), true);
    assert.equal(FondosArcaRouting.requiereArca('TRANSFERENCIA_FACTURADA'), true);
    assert.equal(FondosArcaRouting.requiereArca('EFECTIVO'), false);
    assert.equal(FondosArcaRouting.requiereArca('TRANSFERENCIA'), false);
  });

  it('resuelve tipo factura C o X', () => {
    assert.equal(FondosArcaRouting.resolverTipoFactura('DEBITO'), 'C');
    assert.equal(FondosArcaRouting.resolverTipoFactura('TRANSFERENCIA_FACTURADA'), 'C');
    assert.equal(FondosArcaRouting.resolverTipoFactura('EFECTIVO'), 'X');
  });

  it('resuelve nombre de cuenta sistema', () => {
    assert.equal(FondosArcaRouting.resolverNombreCuenta('CREDITO'), 'ARCA');
    assert.equal(FondosArcaRouting.resolverNombreCuenta('TRANSFERENCIA'), 'X');
  });
});
