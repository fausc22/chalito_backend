jest.mock('../../controllers/dbPromise', () => ({
    execute: jest.fn()
}));

const db = require('../../controllers/dbPromise');
const TimeCalculationService = require('../../services/TimeCalculationService');

describe('TimeCalculationService.calcularTiempoEstimado', () => {
    it('caso 1: 6 articulos peso 1 => 10 minutos', () => {
        const tiempo = TimeCalculationService.calcularTiempoEstimado([
            { cantidad: 6, peso: 1 }
        ]);

        expect(tiempo).toBe(10); // ceil(6/4)=2 -> 2*5
    });

    it('caso 2: 6 articulos peso 4 => 30 minutos', () => {
        const tiempo = TimeCalculationService.calcularTiempoEstimado([
            { cantidad: 6, peso: 4 }
        ]);

        expect(tiempo).toBe(30); // ceil(24/4)=6 -> 6*5
    });
});

describe('TimeCalculationService.calcularTiempoEstimadoPedido', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.execute.mockReset();
    });

    it('calcula tiempo por carga con JOIN a articulos', async () => {
        db.execute
            .mockResolvedValueOnce([[
                { articulo_id: 1, cantidad: 2, peso: 1 },
                { articulo_id: 2, cantidad: 2, peso: 3 }
            ]]); // carga total = 8

        const tiempo = await TimeCalculationService.calcularTiempoEstimadoPedido(101);

        expect(tiempo).toBe(10); // ceil(8/4)=2 -> 10
    });

    it('usa fallback peso=1 si un artículo no tiene peso definido', async () => {
        db.execute
            .mockResolvedValueOnce([[
                { articulo_id: 1, cantidad: 4, peso: null }
            ]]); // carga total = 4 -> 5 min, pero mínimo 10

        const tiempo = await TimeCalculationService.calcularTiempoEstimadoPedido(102);

        expect(tiempo).toBe(10); // ceil(4/4)=1 -> 5, piso 10
    });

    it('no rompe pedidos viejos sin items', async () => {
        db.execute
            .mockResolvedValueOnce([[]]); // sin items -> 0, pero mínimo 10

        const tiempo = await TimeCalculationService.calcularTiempoEstimadoPedido(103);

        expect(tiempo).toBe(10); // piso mínimo por pedido
    });

    it('hace fallback a tiempo base si hay error en cálculo', async () => {
        db.execute
            .mockRejectedValueOnce(new Error('DB error'))
            .mockResolvedValueOnce([[{ valor: '20' }]]);

        const tiempo = await TimeCalculationService.calcularTiempoEstimadoPedido(104);

        expect(tiempo).toBe(20);
    });
});
