jest.mock('../../controllers/dbPromise', () => ({
    execute: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../../controllers/dbPromise');
const { crearArticulo, actualizarArticulo } = require('../../controllers/articulosController');

const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('articulosController - peso en create/update', () => {
    const buildConnection = () => ({
        execute: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('POST /articulos usa default peso=1 cuando no viene definido', async () => {
        const req = {
            body: {
                nombre: 'Empanada',
                precio: 1000,
                categoria_id: 2,
                tipo: 'OTRO'
            }
        };
        const res = buildRes();
        const connection = buildConnection();
        db.getConnection.mockResolvedValue(connection);

        connection.execute
            .mockResolvedValueOnce([[{ id: 2 }]]) // categoria existe
            .mockResolvedValueOnce([{ insertId: 10 }]) // insert
            .mockResolvedValueOnce([[]]); // sin contenido

        db.execute
            .mockResolvedValueOnce([[{ id: 10, nombre: 'Empanada', peso: 1 }]]); // select final

        await crearArticulo(req, res);

        const insertCall = connection.execute.mock.calls[1];
        expect(insertCall[0]).toContain('INSERT INTO articulos');
        expect(insertCall[1][8]).toBe(1);
        expect(insertCall[1][11]).toBe(1);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('POST /articulos devuelve 400 si peso está fuera de rango', async () => {
        const req = {
            body: {
                nombre: 'Pizza',
                precio: 5000,
                categoria_id: 1,
                peso: 6
            }
        };
        const res = buildRes();
        const connection = buildConnection();
        db.getConnection.mockResolvedValue(connection);

        await crearArticulo(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'Errores de validación',
                errores: expect.arrayContaining(['El peso debe estar entre 1 y 4'])
            })
        );
        expect(connection.execute).not.toHaveBeenCalled();
    });

    it('PUT /articulos/:id actualiza peso cuando viene definido', async () => {
        const req = {
            params: { id: '7' },
            body: { peso: 4, tipo: 'OTRO' }
        };
        const res = buildRes();
        const connection = buildConnection();
        db.getConnection.mockResolvedValue(connection);

        connection.execute
            .mockResolvedValueOnce([[{ id: 7, codigo_barra: 'ABC123' }]]) // articulo existente
            .mockResolvedValueOnce([{}]) // update
            .mockResolvedValueOnce([{}]); // delete contenido cuando no elaborado

        db.execute
            .mockResolvedValueOnce([[{ id: 7, peso: 4 }]]); // select final

        await actualizarArticulo(req, res);

        const updateCall = connection.execute.mock.calls[1];
        expect(updateCall[0]).toContain('UPDATE articulos SET');
        expect(updateCall[0]).toContain('peso = ?');
        expect(updateCall[1]).toContain(4);
        expect(updateCall[1][updateCall[1].length - 1]).toBe('7');
    });

    it('PUT /articulos/:id no pisa peso cuando no viene definido', async () => {
        const req = {
            params: { id: '8' },
            body: { nombre: 'Milanesa', tipo: 'OTRO' }
        };
        const res = buildRes();
        const connection = buildConnection();
        db.getConnection.mockResolvedValue(connection);

        connection.execute
            .mockResolvedValueOnce([[{ id: 8, codigo_barra: 'ABC999' }]]) // articulo existente
            .mockResolvedValueOnce([{}]) // update
            .mockResolvedValueOnce([{}]); // delete contenido cuando no elaborado

        db.execute
            .mockResolvedValueOnce([[{ id: 8, nombre: 'Milanesa', peso: 3 }]]); // select final

        await actualizarArticulo(req, res);

        const updateCall = connection.execute.mock.calls[1];
        expect(updateCall[0]).toContain('UPDATE articulos SET');
        expect(updateCall[0]).not.toContain('peso = ?');
    });

    it('PUT /articulos/:id permite actualizar peso si stock negativo heredado no cambia', async () => {
        const req = {
            params: { id: '9' },
            body: { peso: 3, stock_actual: -2, tipo: 'OTRO' }
        };
        const res = buildRes();
        const connection = buildConnection();
        db.getConnection.mockResolvedValue(connection);

        connection.execute
            .mockResolvedValueOnce([[{ id: 9, codigo_barra: 'NEG1', stock_actual: -2, tipo: 'OTRO' }]]) // articulo existente
            .mockResolvedValueOnce([{}]) // update
            .mockResolvedValueOnce([{}]); // delete contenido cuando no elaborado

        db.execute
            .mockResolvedValueOnce([[{ id: 9, peso: 3, stock_actual: -2 }]]); // select final

        await actualizarArticulo(req, res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        const updateCall = connection.execute.mock.calls[1];
        expect(updateCall[0]).toContain('UPDATE articulos SET');
        expect(updateCall[1]).toContain(3);
    });
});
