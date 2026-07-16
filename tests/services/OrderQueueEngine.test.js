jest.mock('../../controllers/dbPromise', () => ({
    execute: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../../controllers/dbPromise');
const { OrderQueueEngine } = require('../../services/OrderQueueEngine');
const TimeCalculationService = require('../../services/TimeCalculationService');
const KitchenCapacityService = require('../../services/KitchenCapacityService');

describe('OrderQueueEngine.moverPedidoAPreparacion', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it('guarda tiempo calculado y hora_esperada_finalizacion al mover pedido', async () => {
        const pedidoId = 2001;
        const tiempoCalculado = 35;
        const horaEsperadaMock = new Date('2026-02-26T21:35:00.000Z');

        const connection = {
            execute: jest.fn()
                .mockResolvedValueOnce([[{
                    medio_pago: 'EFECTIVO',
                    estado_pago: 'PENDIENTE',
                    origen_pedido: 'MOSTRADOR'
                }]])
                .mockResolvedValueOnce([{}])
        };

        jest.spyOn(TimeCalculationService, 'calcularTiempoEstimadoPedido').mockResolvedValue(tiempoCalculado);
        jest.spyOn(TimeCalculationService, 'calcularHoraEsperadaFinalizacion').mockReturnValue(horaEsperadaMock);
        const comandaSpy = jest.spyOn(OrderQueueEngine, 'crearComandaAutomatica').mockResolvedValue();

        await OrderQueueEngine.moverPedidoAPreparacion(connection, pedidoId);

        expect(TimeCalculationService.calcularTiempoEstimadoPedido).toHaveBeenCalledWith(pedidoId, { connection });
        expect(connection.execute).toHaveBeenCalledTimes(2);

        const updateCall = connection.execute.mock.calls[1];
        expect(updateCall[0]).toContain("estado = 'EN_PREPARACION'");
        expect(updateCall[0]).toContain('tiempo_estimado_preparacion = ?');
        expect(updateCall[1][1]).toBe(tiempoCalculado);
        expect(updateCall[1][2]).toEqual(horaEsperadaMock);
        expect(updateCall[1][3]).toBe(pedidoId);

        expect(comandaSpy).toHaveBeenCalledWith(connection, pedidoId);
    });
});

describe('OrderQueueEngine.evaluarColaPedidos', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        db.execute.mockReset();
        db.getConnection.mockReset();
    });

    it('filtra en SQL pedidos programados por tiempo_estimado_preparacion dinámico', async () => {
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn()
                // stats audit query
                .mockResolvedValueOnce([[{ total_pendientes: 1, pendientes_automaticos: 1, pendientes_manuales: 0 }]])
                // SELECT candidatos FOR UPDATE
                .mockResolvedValueOnce([[
                    {
                        id: 3001,
                        estado: 'RECIBIDO',
                        horario_entrega: new Date('2026-02-27T21:00:00.000Z'),
                        tiempo_estimado_preparacion: 30,
                        prioridad: 'NORMAL',
                        transicion_automatica: 1,
                        inicio_preparacion_calculado: new Date('2026-02-27T20:30:00.000Z')
                    }
                ]]),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(connection);

        jest.spyOn(KitchenCapacityService, 'obtenerInfoCapacidadEnTransaccion').mockResolvedValue({
            estaLlena: false,
            pedidosEnPreparacion: 1,
            capacidadMaxima: 8,
            espaciosDisponibles: 2,
            porcentajeUso: 13
        });
        jest.spyOn(KitchenCapacityService, 'obtenerInfoCapacidad').mockResolvedValue({
            estaLlena: false,
            pedidosEnPreparacion: 2,
            capacidadMaxima: 8,
            espaciosDisponibles: 1,
            porcentajeUso: 25
        });
        jest.spyOn(OrderQueueEngine, 'moverPedidoAPreparacion').mockResolvedValue(undefined);

        const resultado = await OrderQueueEngine.evaluarColaPedidos();

        expect(KitchenCapacityService.obtenerInfoCapacidadEnTransaccion).toHaveBeenCalledWith(connection);
        const selectCall = connection.execute.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes("WHERE estado IN ('RECIBIDO', 'PROGRAMADO', 'programado')")
                && sql.includes('FOR UPDATE')
        );
        expect(selectCall).toBeTruthy();
        const query = selectCall[0];
        expect(query).toContain("WHERE estado IN ('RECIBIDO', 'PROGRAMADO', 'programado')");
        expect(query).toContain('MERCADOPAGO');
        expect(query).toContain('NOW() >= DATE_SUB(horario_entrega, INTERVAL tiempo_estimado_preparacion MINUTE)');
        expect(query).toContain('tiempo_estimado_preparacion > 0');
        expect(OrderQueueEngine.moverPedidoAPreparacion).toHaveBeenCalledWith(connection, 3001);
        expect(resultado.procesados).toBe(1);
    });
});
