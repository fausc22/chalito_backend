const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolverAccionSesionMp,
    seleccionarPagoCanonicoMp,
    mapearEstadoMercadoPago,
    mapearEstadoPagoUiDesdeSesion,
    sesionReconciliable
} = require('../../services/mercadoPagoPaymentStateMachine');

describe('mercadoPagoPaymentStateMachine', () => {
    it('mapea estados MP a estados internos', () => {
        assert.equal(mapearEstadoMercadoPago('approved'), 'PAGADO');
        assert.equal(mapearEstadoMercadoPago('rejected'), 'RECHAZADO');
        assert.equal(mapearEstadoMercadoPago('pending'), 'PENDIENTE');
        assert.equal(mapearEstadoMercadoPago('cancelled'), 'CANCELADO');
    });

    it('approved prevalece sobre sesión CANCELADO', () => {
        const accion = resolverAccionSesionMp({
            estadoSesion: 'CANCELADO',
            estadoProveedor: 'approved'
        });
        assert.equal(accion, 'crear_pedido');
    });

    it('rechazo en sesión PENDIENTE no cierra la sesión (registrar_no_aprobado)', () => {
        const accion = resolverAccionSesionMp({
            estadoSesion: 'PENDIENTE',
            estadoProveedor: 'rejected'
        });
        assert.equal(accion, 'registrar_no_aprobado');
    });

    it('sesión PROCESADO es idempotente', () => {
        const accion = resolverAccionSesionMp({
            estadoSesion: 'PROCESADO',
            estadoProveedor: 'approved',
            pedidoIdExistente: 123
        });
        assert.equal(accion, 'idempotente');
    });

    it('sesión EXPIRADO ignora eventos no aprobados', () => {
        const accion = resolverAccionSesionMp({
            estadoSesion: 'EXPIRADO',
            estadoProveedor: 'rejected'
        });
        assert.equal(accion, 'ignorar');
    });

    it('sesión EXPIRADO con approved permite crear pedido', () => {
        const accion = resolverAccionSesionMp({
            estadoSesion: 'EXPIRADO',
            estadoProveedor: 'approved'
        });
        assert.equal(accion, 'crear_pedido');
    });

    it('selecciona approved aunque haya rejected previo', () => {
        const selected = seleccionarPagoCanonicoMp([
            { id: '1', status: 'rejected' },
            { id: '2', status: 'approved' }
        ]);
        assert.equal(selected.id, '2');
    });

    it('mapea UI de sesión CANCELADO con último estado rejected', () => {
        const estado = mapearEstadoPagoUiDesdeSesion(
            { estado: 'CANCELADO', estado_mp: 'rejected' },
            null
        );
        assert.equal(estado, 'RECHAZADO');
    });

    it('mapea UI de sesión PENDIENTE con último estado approved', () => {
        const estado = mapearEstadoPagoUiDesdeSesion(
            { estado: 'PENDIENTE', estado_mp: 'approved' },
            null
        );
        assert.equal(estado, 'PAGADO');
    });

    it('sesiones PENDIENTE y CANCELADO son reconciliables', () => {
        assert.equal(sesionReconciliable('PENDIENTE'), true);
        assert.equal(sesionReconciliable('CANCELADO'), true);
        assert.equal(sesionReconciliable('PROCESADO'), false);
    });
});
