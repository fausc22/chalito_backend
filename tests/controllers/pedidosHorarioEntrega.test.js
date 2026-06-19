jest.mock('../../controllers/dbPromise', () => ({
    execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
}));

jest.mock('../../middlewares/auditoriaMiddleware', () => ({
    obtenerDatosAnteriores: jest.fn(),
    auditarOperacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../services/pedidoRealtimeSerializer', () => ({
    buildPedidoSnapshotById: jest.fn().mockResolvedValue({ id: 42, estado: 'RECIBIDO' }),
    enrichPedidoRealtime: jest.fn()
}));

const mockEmitPedidoActualizado = jest.fn();
jest.mock('../../services/SocketService', () => ({
    getInstance: jest.fn(() => ({
        emitPedidoActualizado: mockEmitPedidoActualizado
    }))
}));

const db = require('../../controllers/dbPromise');
const { obtenerDatosAnteriores } = require('../../middlewares/auditoriaMiddleware');
const { getInstance } = require('../../services/SocketService');
const { actualizarHorarioEntrega } = require('../../controllers/pedidosController');

const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const pedidoBase = {
    id: 42,
    estado: 'RECIBIDO',
    tiempo_estimado_preparacion: 15
};

describe('actualizarHorarioEntrega', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('guarda horario en formato MySQL con timezone Argentina', async () => {
        obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase });
        const req = {
            validatedParams: { id: 42 },
            validatedData: { horario_entrega: '2026-06-20T01:30:00.000Z' },
            app: { get: () => null }
        };
        const res = buildRes();

        await actualizarHorarioEntrega(req, res);

        expect(db.execute).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE pedidos'),
            ['2026-06-19 22:30:00', 'NORMAL', '2026-06-19 22:15:00', 42]
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });

    it('responde 200 con horario futuro válido', async () => {
        obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase });
        const req = {
            validatedParams: { id: 42 },
            validatedData: { horario_entrega: '2026-12-25T15:00:00.000Z' },
            app: { get: () => null }
        };
        const res = buildRes();

        await actualizarHorarioEntrega(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });

    it('Cuanto antes: NULL en fechas y prioridad ALTA', async () => {
        obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase });
        const req = {
            validatedParams: { id: 42 },
            validatedData: { horario_entrega: null },
            app: { get: () => null }
        };
        const res = buildRes();

        await actualizarHorarioEntrega(req, res);

        expect(db.execute).toHaveBeenCalledWith(
            expect.any(String),
            [null, 'ALTA', null, 42]
        );
    });

    it('devuelve 409 para pedido ENTREGADO o CANCELADO', async () => {
        for (const estado of ['ENTREGADO', 'CANCELADO']) {
            obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase, estado });
            const req = {
                validatedParams: { id: 42 },
                validatedData: { horario_entrega: '2026-06-20T01:30:00.000Z' },
                app: { get: () => null }
            };
            const res = buildRes();

            await actualizarHorarioEntrega(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(db.execute).not.toHaveBeenCalled();
            jest.clearAllMocks();
        }
    });

    it('devuelve 400 si la fecha es inválida', async () => {
        obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase });
        const req = {
            validatedParams: { id: 42 },
            validatedData: { horario_entrega: 'fecha-invalida' },
            app: { get: () => null }
        };
        const res = buildRes();

        await actualizarHorarioEntrega(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.execute).not.toHaveBeenCalled();
    });

    it('emite pedido:actualizado vía SocketService cuando hay io', async () => {
        obtenerDatosAnteriores.mockResolvedValue({ ...pedidoBase });
        const mockIo = { id: 'socket-io' };
        const req = {
            validatedParams: { id: 42 },
            validatedData: { horario_entrega: '2026-06-20T01:30:00.000Z' },
            app: { get: (key) => (key === 'io' ? mockIo : null) }
        };
        const res = buildRes();

        await actualizarHorarioEntrega(req, res);

        expect(getInstance).toHaveBeenCalledWith(mockIo);
        expect(mockEmitPedidoActualizado).toHaveBeenCalledWith(42, { id: 42, estado: 'RECIBIDO' });
    });
});
