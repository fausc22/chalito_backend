const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappServicePath = require.resolve('../../services/whatsappService');
const contactResolverPath = require.resolve('../../services/whatsappContactResolver');

const originalWhatsappService = require(whatsappServicePath);

function loadResolverWithEstado(estado) {
    require.cache[whatsappServicePath] = {
        id: whatsappServicePath,
        filename: whatsappServicePath,
        loaded: true,
        exports: {
            ...originalWhatsappService,
            obtenerEstado: () => estado,
        },
    };
    delete require.cache[contactResolverPath];
    return require(contactResolverPath);
}

test.after(() => {
    require.cache[whatsappServicePath] = {
        id: whatsappServicePath,
        filename: whatsappServicePath,
        loaded: true,
        exports: originalWhatsappService,
    };
    delete require.cache[contactResolverPath];
});

test('resolveNumeroContactoConFuente limpia phone de Baileys con deviceId', () => {
    const originalEnv = process.env.WHATSAPP_NUMERO_CONTACTO;
    delete process.env.WHATSAPP_NUMERO_CONTACTO;

    try {
        const resolver = loadResolverWithEstado({
            connected: true,
            phone: '5492302651250:19@s.whatsapp.net',
        });
        const { numero, fuente } = resolver.resolveNumeroContactoConFuente('5492222222222');
        assert.equal(numero, '5492302651250');
        assert.equal(fuente, 'baileys');
    } finally {
        if (originalEnv === undefined) {
            delete process.env.WHATSAPP_NUMERO_CONTACTO;
        } else {
            process.env.WHATSAPP_NUMERO_CONTACTO = originalEnv;
        }
    }
});

test('resolveNumeroContactoConFuente prioriza env sobre db cuando no hay baileys', () => {
    const originalEnv = process.env.WHATSAPP_NUMERO_CONTACTO;
    process.env.WHATSAPP_NUMERO_CONTACTO = '5491111111111';

    try {
        const resolver = loadResolverWithEstado({
            connected: false,
            phone: null,
        });
        const { numero, fuente } = resolver.resolveNumeroContactoConFuente('5492222222222');
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
