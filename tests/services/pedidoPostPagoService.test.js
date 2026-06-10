const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('PedidoCobroService', () => {
  it('carga sin error de sintaxis (import FondosArcaRouting único)', () => {
    const mod = require('../../services/PedidoCobroService');
    assert.equal(typeof mod.cobrarPedidoIdempotente, 'function');
    assert.equal(typeof mod.ejecutarPostCobro, 'function');
  });
});

describe('PedidoPostPagoService', () => {
  it('exporta reconciliación idempotente para MP', () => {
    const mod = require('../../services/PedidoPostPagoService');
    assert.equal(typeof mod.procesarAprobacionMercadoPago, 'function');
    assert.equal(typeof mod.reconciliarVentaPedidoPagado, 'function');
    assert.equal(typeof mod.reconciliarPedidosMpPagadosSinVenta, 'function');
  });
});
