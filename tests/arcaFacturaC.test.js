const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildScheduledLabel } = require('../services/print/printPayloadShared');

describe('buildScheduledLabel', () => {
    it('devuelve hora sin prefijo PARA', () => {
        const label = buildScheduledLabel({
            horario_entrega: '2026-05-19T17:30:00.000Z'
        });
        assert.ok(label);
        assert.ok(!label.includes('PARA'));
        assert.match(label, /^\d{2}:\d{2}$/);
    });

    it('devuelve CUANTO ANTES si no hay horario', () => {
        assert.equal(buildScheduledLabel({}), 'CUANTO ANTES');
    });
});

describe('transformarAFormatoARCA Factura C', () => {
    it('CbteTipo 11 sin array Iva e ImpIVA=0', async () => {
        const { transformarAFormatoARCA } = await import('../arca-microservice/utils/formatters.js');

        const datos = {
            tipoComprobante: 11,
            concepto: 1,
            cliente: {
                tipoDocumento: 99,
                numeroDocumento: '0',
                condicionIVA: 5
            },
            items: [
                {
                    descripcion: 'Producto',
                    cantidad: 1,
                    precioUnitario: 5000,
                    alicuotaIVA: 21
                }
            ],
            impNeto: 5000,
            impIVA: 0,
            impTotal: 5000
        };

        const arca = transformarAFormatoARCA(datos, 1, 1);

        assert.equal(arca.CbteTipo, 11);
        assert.equal(arca.ImpIVA, 0);
        assert.equal(arca.ImpNeto, 5000);
        assert.equal(arca.ImpTotal, 5000);
        assert.equal(arca.Iva, undefined);
    });
});
