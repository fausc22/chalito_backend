const KitchenCapacityService = require('../../services/KitchenCapacityService');

describe('KitchenCapacityService.normalizarCapacidad', () => {
    it('acepta valores exactos dentro de 1..200', () => {
        expect(KitchenCapacityService.normalizarCapacidad(20)).toBe(20);
        expect(KitchenCapacityService.normalizarCapacidad(100)).toBe(100);
        expect(KitchenCapacityService.normalizarCapacidad('100')).toBe(100);
    });

    it('usa fallback ante valores inválidos o fuera de rango', () => {
        expect(KitchenCapacityService.normalizarCapacidad(0, 8)).toBe(8);
        expect(KitchenCapacityService.normalizarCapacidad(201, 8)).toBe(8);
        expect(KitchenCapacityService.normalizarCapacidad('abc', 8)).toBe(8);
        expect(KitchenCapacityService.normalizarCapacidad(null, 8)).toBe(8);
    });
});
