const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    helpers
} = require('../../services/CartaPublicaMercadoPagoCheckoutService');
const paymentLogger = require('../../services/mercadoPagoPaymentLogger');

const {
    esResumenCarritoCongeladoUsable,
    assertMontoMpCoincideConTotalSesion,
    buildPayloadDivergenciaMenuPostPago,
    crearPedidoDesdeSesion,
    persistirHuellaPagoAprobadoSinPedido,
    TOLERANCIA_MONTO_MP_ARS
} = helpers;

function buildResumenCongelado(total = 54000) {
    return {
        itemsNormalizados: [
            {
                articulo_id: 17,
                articulo_nombre: 'Hamburguesa Bluecheese',
                cantidad: 1,
                precio_unitario: total,
                subtotal: total,
                observaciones: null,
                personalizaciones: null
            }
        ],
        subtotal: total * 0.8264,
        iva_total: total * 0.1736,
        total,
        montoDescuento: 0,
        subtotalBruto: total,
        cupon: null
    };
}

describe('MP checkout sesión — carrito congelado', () => {
    it('acepta resumen congelado usable', () => {
        assert.equal(esResumenCarritoCongeladoUsable(buildResumenCongelado()), true);
    });

    it('rechaza resumen sin items o total inválido', () => {
        assert.equal(esResumenCarritoCongeladoUsable(null), false);
        assert.equal(esResumenCarritoCongeladoUsable({ itemsNormalizados: [], total: 100 }), false);
        assert.equal(
            esResumenCarritoCongeladoUsable({ itemsNormalizados: [{ articulo_id: 1 }], total: 'x' }),
            false
        );
    });

    it('valida monto MP contra total de sesión (caso Yanina)', () => {
        assert.doesNotThrow(() => assertMontoMpCoincideConTotalSesion(54000, 54000));
        assert.throws(
            () => assertMontoMpCoincideConTotalSesion(54000, 55000),
            /no coincide con total de sesión/
        );
    });

    it('tolera diferencias menores a TOLERANCIA_MONTO_MP_ARS', () => {
        assert.doesNotThrow(() =>
            assertMontoMpCoincideConTotalSesion(54000, 54000 + TOLERANCIA_MONTO_MP_ARS)
        );
        assert.throws(() =>
            assertMontoMpCoincideConTotalSesion(54000, 54000 + TOLERANCIA_MONTO_MP_ARS + 0.01)
        );
    });

    it('arma payload de divergencia de menú', () => {
        const payload = buildPayloadDivergenciaMenuPostPago({
            sessionId: 'abc',
            paymentId: '172266194640',
            totalSesion: 54000,
            totalLive: 55000,
            montoMp: 54000
        });
        assert.equal(payload.delta, 1000);
        assert.equal(payload.totalSesion, 54000);
        assert.equal(payload.totalLive, 55000);
        assert.equal(payload.paymentId, '172266194640');
    });
});

describe('crearPedidoDesdeSesion con resumen congelado', () => {
    let logSpy;

    beforeEach(() => {
        logSpy = mock.method(paymentLogger, 'logMpEvent', () => {});
    });

    afterEach(() => {
        logSpy.mock.restore();
    });

    it('crea pedido con total de sesión aunque el menú vivo daría otro total', async () => {
        const executes = [];
        const connection = {
            execute: async (sql, params) => {
                executes.push({ sql: String(sql), params });
                if (String(sql).includes('FROM articulos')) {
                    // Recalc live pediría precios; devolvemos precio distinto (+1000)
                    return [[{
                        id: 17,
                        nombre: 'Hamburguesa Bluecheese',
                        precio: 55000,
                        controla_stock: 0,
                        categoria_nombre: 'Hamburguesas'
                    }]];
                }
                if (String(sql).includes('INSERT INTO pedidos')) {
                    return [{ insertId: 999 }];
                }
                if (String(sql).includes('INSERT INTO pedidos_contenido')) {
                    return [{ affectedRows: 1 }];
                }
                if (String(sql).includes('INSERT INTO pedidos_pagos')) {
                    return [{ insertId: 1 }];
                }
                if (String(sql).includes('UPDATE checkout_sesiones_mp')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }
        };

        const sesionRow = {
            id: '98995b21-552e-4361-9206-a5855717e9cd',
            referencia_externa: 'sesion_mp_98995b21-552e-4361-9206-a5855717e9cd',
            id_preferencia: 'pref-1',
            payload_checkout: {
                payload: {
                    cliente: {
                        nombre: 'Yanina',
                        telefono: '5492302487732',
                        email: 'yanibadini@gmail.com',
                        direccion: 'Calle 8'
                    },
                    pedido: {
                        modalidad: 'DELIVERY',
                        prioridad: 'ALTA',
                        medio_pago: 'MERCADOPAGO',
                        horario_entrega: null,
                        observaciones: null
                    },
                    items: [{ articulo_id: 17, cantidad: 1, extras: [] }]
                },
                couponCode: null,
                resumenCarrito: buildResumenCongelado(54000)
            }
        };

        const pedidoId = await crearPedidoDesdeSesion(
            connection,
            sesionRow,
            {
                status: 'approved',
                status_detail: 'accredited',
                transaction_amount: 54000,
                date_approved: '2026-08-05T22:50:53.000Z'
            },
            '172266194640'
        );

        assert.equal(pedidoId, 999);

        const insertPedido = executes.find((e) => e.sql.includes('INSERT INTO pedidos'));
        assert.ok(insertPedido);
        // total está en la posición del values array (índice 6 = total tras cliente fields)
        assert.equal(insertPedido.params[6], 54000);

        const divergeLogs = logSpy.mock.calls.filter(
            (c) => c.arguments[1] === 'mp_menu_precio_diverge_post_pago'
        );
        assert.equal(divergeLogs.length, 1);
        assert.equal(divergeLogs[0].arguments[2].delta, 1000);
        assert.equal(divergeLogs[0].arguments[2].totalSesion, 54000);
        assert.equal(divergeLogs[0].arguments[2].totalLive, 55000);
    });

    it('rechaza si monto MP no calza con total congelado de sesión', async () => {
        const connection = {
            execute: async () => {
                throw new Error('no debería tocar la DB');
            }
        };

        await assert.rejects(
            () => crearPedidoDesdeSesion(
                connection,
                {
                    id: 'sesion-1',
                    referencia_externa: 'sesion_mp_x',
                    id_preferencia: 'p',
                    payload_checkout: {
                        payload: {
                            cliente: { nombre: 'A', telefono: '1' },
                            pedido: { modalidad: 'RETIRO', prioridad: 'ALTA', medio_pago: 'MERCADOPAGO' },
                            items: [{ articulo_id: 1, cantidad: 1, extras: [] }]
                        },
                        resumenCarrito: buildResumenCongelado(55000)
                    }
                },
                { status: 'approved', transaction_amount: 54000 },
                'pay-1'
            ),
            /no coincide con total de sesión/
        );
    });
});

describe('persistirHuellaPagoAprobadoSinPedido', () => {
    let logSpy;

    beforeEach(() => {
        logSpy = mock.method(paymentLogger, 'logMpEvent', () => {});
    });

    afterEach(() => {
        logSpy.mock.restore();
    });

    it('actualiza id_pago/estado_mp y loguea error estructurado', async () => {
        const calls = [];
        const db = {
            execute: async (sql, params) => {
                calls.push({ sql: String(sql), params });
                return [{ affectedRows: 1 }];
            }
        };

        await persistirHuellaPagoAprobadoSinPedido(db, {
            sessionId: '98995b21-552e-4361-9206-a5855717e9cd',
            paymentId: '172266194640',
            estadoMp: 'approved',
            errorMessage: 'fallo de prueba'
        });

        assert.equal(calls.length, 1);
        assert.match(calls[0].sql, /UPDATE checkout_sesiones_mp/);
        assert.deepEqual(calls[0].params, [
            '172266194640',
            'approved',
            '98995b21-552e-4361-9206-a5855717e9cd'
        ]);

        const errLogs = logSpy.mock.calls.filter(
            (c) => c.arguments[1] === 'mp_pedido_no_creado_pago_aprobado'
        );
        assert.equal(errLogs.length, 1);
        assert.equal(errLogs[0].arguments[2].message, 'fallo de prueba');
    });
});
