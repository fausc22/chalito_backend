const {
    computeMaxMontoConCuantoAbona,
    validateMontoConCuantoAbonaEfectivo
} = require('../../services/montoConCuantoAbonaRules');

describe('montoConCuantoAbonaRules', () => {
    describe('computeMaxMontoConCuantoAbona', () => {
        it('total 14_000 => 64_000 (50k exceso base)', () => {
            expect(computeMaxMontoConCuantoAbona(14000)).toBe(64000);
        });
        it('total 100_000 => 175_000 (75% exceso)', () => {
            expect(computeMaxMontoConCuantoAbona(100000)).toBe(175000);
        });
        it('total 3_000 => 53_000', () => {
            expect(computeMaxMontoConCuantoAbona(3000)).toBe(53000);
        });
    });

    describe('validateMontoConCuantoAbonaEfectivo', () => {
        it('rechaza monto absurdo vs total', () => {
            const r = validateMontoConCuantoAbonaEfectivo(150000, 14000);
            expect(r.ok).toBe(false);
            expect(r.code).toBe('MONTO_EFECTIVO_EXCEDE_MAXIMO');
        });
        it('acepta pago con billete 50k para total 14k', () => {
            expect(validateMontoConCuantoAbonaEfectivo(50000, 14000).ok).toBe(true);
        });
        it('rechaza menor al total', () => {
            const r = validateMontoConCuantoAbonaEfectivo(10000, 14000);
            expect(r.ok).toBe(false);
            expect(r.code).toBe('MONTO_EFECTIVO_MENOR_AL_TOTAL');
        });
    });
});
