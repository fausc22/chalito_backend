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

  it('resuelve medio fiscal desde split priorizando ARCA', () => {
    const medios = [
      { medio_pago: 'EFECTIVO', monto: 15000 },
      { medio_pago: 'DEBITO', monto: 10000 }
    ];
    assert.equal(FondosArcaRouting.resolverMedioFiscalDesdeSplit(medios), 'DEBITO');
    assert.equal(
      FondosArcaRouting.resolverMedioFiscalDesdeSplit([
        { medio_pago: 'EFECTIVO', monto: 20000 },
        { medio_pago: 'TRANSFERENCIA', monto: 5000 }
      ]),
      'EFECTIVO'
    );
  });

  it('genera label compuesto de medios de pago', () => {
    const medios = [
      { medio_pago: 'efectivo', monto: 15000 },
      { medio_pago: 'debito', monto: 10000 }
    ];
    assert.equal(FondosArcaRouting.generarLabelMediosPago(medios), 'EFECTIVO + DEBITO');
  });
});
