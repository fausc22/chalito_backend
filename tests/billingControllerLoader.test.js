const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('billingControllerLoader', () => {
  it('expone funciones de carga y estado', () => {
    const loader = require('../lib/billingControllerLoader');
    assert.equal(typeof loader.getBillingController, 'function');
    assert.equal(typeof loader.loadBillingController, 'function');
    assert.equal(typeof loader.isBillingControllerLoaded, 'function');
    assert.equal(typeof loader.preloadBillingController, 'function');
  });
});
