const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    isHardeningEnabled,
    incrementMetric,
    getMetricasMp,
    resetMetricasMp
} = require('../../services/mercadoPagoPaymentLogger');

describe('mercadoPagoPaymentLogger', () => {
    beforeEach(() => {
        resetMetricasMp();
        delete process.env.MP_HARDENING_ENABLED;
    });

    it('habilita hardening por defecto', () => {
        assert.equal(isHardeningEnabled(), true);
    });

    it('permite desactivar hardening por env', () => {
        process.env.MP_HARDENING_ENABLED = 'false';
        assert.equal(isHardeningEnabled(), false);
    });

    it('incrementa métricas en memoria', () => {
        incrementMetric('webhooksProcesados', 2);
        incrementMetric('aprobacionesCreadas');
        const metricas = getMetricasMp();
        assert.equal(metricas.webhooksProcesados, 2);
        assert.equal(metricas.aprobacionesCreadas, 1);
        assert.equal(metricas.hardeningEnabled, true);
    });
});
