const {
    pedidoEstaHabilitadoOperativamente,
    esEstadoAvanceOperativoCocina,
    SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE,
    pedidoEstaBloqueadoPorMercadoPagoWebPendiente
} = require('../../services/pedidoOperativoHelper');

describe('pedidoOperativoHelper', () => {
    it('habilita efectivo y transferencia no web aunque no esté PAGADO', () => {
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'MOSTRADOR',
            medio_pago: 'EFECTIVO',
            estado_pago: 'PENDIENTE'
        })).toBe(true);
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'MOSTRADOR',
            medio_pago: 'TRANSFERENCIA',
            estado_pago: 'PENDIENTE'
        })).toBe(true);
    });

    it('permite Mercado Pago presencial pendiente (puede ir a cocina)', () => {
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'MOSTRADOR',
            medio_pago: 'MERCADOPAGO',
            estado_pago: 'PENDIENTE'
        })).toBe(true);
        expect(pedidoEstaBloqueadoPorMercadoPagoWebPendiente({
            origen_pedido: 'MOSTRADOR',
            medio_pago: 'MERCADOPAGO',
            estado_pago: 'RECHAZADO'
        })).toBe(false);
    });

    it('bloquea Mercado Pago WEB si estado_pago no es PAGADO', () => {
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'WEB',
            medio_pago: 'MERCADOPAGO',
            estado_pago: 'PENDIENTE'
        })).toBe(false);
    });

    it('habilita Mercado Pago cuando está PAGADO', () => {
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'WEB',
            medio_pago: 'MERCADOPAGO',
            estado_pago: 'PAGADO'
        })).toBe(true);
    });

    it('bloquea transferencia WEB sin acreditar', () => {
        expect(pedidoEstaHabilitadoOperativamente({
            origen_pedido: 'WEB',
            medio_pago: 'TRANSFERENCIA',
            estado_pago: 'PENDIENTE'
        })).toBe(false);
    });

    it('marca EN_PREPARACION y LISTO como avance operativo de cocina', () => {
        expect(esEstadoAvanceOperativoCocina('EN_PREPARACION')).toBe(true);
        expect(esEstadoAvanceOperativoCocina('LISTO')).toBe(true);
        expect(esEstadoAvanceOperativoCocina('ENTREGADO')).toBe(false);
        expect(esEstadoAvanceOperativoCocina('CANCELADO')).toBe(false);
    });

    it('expone fragmento SQL reutilizable solo para WEB digital pendiente', () => {
        expect(SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE).toContain('MERCADOPAGO');
        expect(SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE).toContain('TRANSFERENCIA');
        expect(SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE).toContain("'WEB'");
    });
});
