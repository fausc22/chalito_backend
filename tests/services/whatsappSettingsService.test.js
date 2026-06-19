const test = require('node:test');
const assert = require('node:assert/strict');
const {
    deriveModoPedidosWeb,
    resolveNumeroContactoConFuente,
} = require('../../services/whatsappSettingsService');
const {
    resolveClienteLocalTemplateForPedido,
} = require('../../services/whatsappClienteAlLocalService');
const { DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL } = require('../../services/whatsappTemplateDefaults');

test('deriveModoPedidosWeb es exclusivo', () => {
    assert.equal(
        deriveModoPedidosWeb({ notificacionesActivas: true, clienteEnviaAlLocal: false }),
        'local_a_cliente'
    );
    assert.equal(
        deriveModoPedidosWeb({ notificacionesActivas: false, clienteEnviaAlLocal: true }),
        'cliente_a_local'
    );
    assert.equal(
        deriveModoPedidosWeb({ notificacionesActivas: false, clienteEnviaAlLocal: false }),
        'desactivado'
    );
    assert.equal(
        deriveModoPedidosWeb({ notificacionesActivas: true, clienteEnviaAlLocal: true }),
        'desactivado'
    );
});

test('resolveClienteLocalTemplateForPedido prioriza claves nuevas sobre legacy', () => {
    const custom = 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} custom';
    const settings = {
        plantillasClienteLocal: { EFECTIVO_RETIRO: custom },
        templateClienteAlLocal: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    };
    const result = resolveClienteLocalTemplateForPedido('EFECTIVO_RETIRO', settings);
    assert.equal(result, custom);
});

test('resolveClienteLocalTemplateForPedido usa legacy si clave nueva vacía', () => {
    const settings = {
        plantillasClienteLocal: { EFECTIVO_RETIRO: '' },
        templateClienteAlLocal: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    };
    const result = resolveClienteLocalTemplateForPedido('EFECTIVO_RETIRO', settings);
    assert.equal(result, DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL);
});

test('resolveNumeroContactoConFuente prioriza env sobre db cuando no hay baileys', () => {
    const originalEnv = process.env.WHATSAPP_NUMERO_CONTACTO;
    process.env.WHATSAPP_NUMERO_CONTACTO = '5491111111111';
    try {
        const { numero, fuente } = resolveNumeroContactoConFuente('5492222222222');
        assert.equal(numero, '5491111111111');
        assert.equal(fuente, 'env');
    } finally {
        if (originalEnv === undefined) {
            delete process.env.WHATSAPP_NUMERO_CONTACTO;
        } else {
            process.env.WHATSAPP_NUMERO_CONTACTO = originalEnv;
        }
    }
});
