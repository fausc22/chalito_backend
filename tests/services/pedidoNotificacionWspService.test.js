const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappServicePath = require.resolve('../../services/whatsappService');
const settingsServicePath = require.resolve('../../services/whatsappSettingsService');
const notifServicePath = require.resolve('../../services/pedidoNotificacionWspService');

const originalWhatsappService = require(whatsappServicePath);
const originalSettingsService = require(settingsServicePath);

function loadNotifService({ connected = true, notificacionesActivas = true, alias = 'elchalito.mp' } = {}) {
    require.cache[whatsappServicePath] = {
        id: whatsappServicePath,
        filename: whatsappServicePath,
        loaded: true,
        exports: {
            ...originalWhatsappService,
            estaConectado: () => connected,
            enviarWhatsApp: async () => ({ ok: true }),
        },
    };

    require.cache[settingsServicePath] = {
        id: settingsServicePath,
        filename: settingsServicePath,
        loaded: true,
        exports: {
            ...originalSettingsService,
            getSettings: async () => ({
                notificacionesActivas,
                nombreNegocio: 'El Chalito',
                aliasTransferencia: alias,
                plantillas: {
                    EFECTIVO_RETIRO: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}}',
                    EFECTIVO_DELIVERY: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}}',
                    TRANSFERENCIA_RETIRO: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}} alias {{alias}}',
                    TRANSFERENCIA_DELIVERY: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}} alias {{alias}}',
                    MERCADOPAGO_RETIRO: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}}',
                    MERCADOPAGO_DELIVERY: 'Hola {{local}} pedido {{id}} {{contenido}} total {{total}}',
                },
            }),
        },
    };

    delete require.cache[notifServicePath];
    return require(notifServicePath);
}

test.after(() => {
    require.cache[whatsappServicePath] = {
        id: whatsappServicePath,
        filename: whatsappServicePath,
        loaded: true,
        exports: originalWhatsappService,
    };
    require.cache[settingsServicePath] = {
        id: settingsServicePath,
        filename: settingsServicePath,
        loaded: true,
        exports: originalSettingsService,
    };
    delete require.cache[notifServicePath];
});

test('notificarPedidoWhatsApp omite si notificaciones desactivadas', async () => {
    const service = loadNotifService({ notificacionesActivas: false });
    const result = await service.notificarPedidoEfectivo({
        id: 1,
        cliente_telefono: '2302651250',
        total: 1000,
        modalidad: 'RETIRO',
        items: [{ cantidad: 1, articulo_nombre: 'Pizza', subtotal: 1000 }],
    });
    assert.equal(result, null);
});

test('notificarPedidoWhatsApp omite si telefono invalido', async () => {
    const service = loadNotifService();
    const result = await service.notificarPedidoEfectivo({
        id: 2,
        cliente_telefono: '123',
        total: 1000,
        modalidad: 'RETIRO',
        items: [{ cantidad: 1, articulo_nombre: 'Pizza', subtotal: 1000 }],
    });
    assert.equal(result, null);
});

test('notificarPedidoWhatsApp omite transferencia sin alias valido', async () => {
    const service = loadNotifService({ alias: 'ALIAS.NO.CONFIGURADO' });
    const result = await service.notificarPedidoTransferencia({
        id: 3,
        cliente_telefono: '2302651250',
        total: 1000,
        modalidad: 'RETIRO',
        items: [{ cantidad: 1, articulo_nombre: 'Pizza', subtotal: 1000 }],
    });
    assert.equal(result, null);
});

test('notificarPedidoWhatsApp envia con telefono normalizado', async () => {
    let sentTo = null;
    require.cache[whatsappServicePath] = {
        id: whatsappServicePath,
        filename: whatsappServicePath,
        loaded: true,
        exports: {
            ...originalWhatsappService,
            estaConectado: () => true,
            enviarWhatsApp: async (numero) => {
                sentTo = numero;
                return { ok: true };
            },
        },
    };
    delete require.cache[notifServicePath];
    const service = require(notifServicePath);

    await service.notificarPedidoEfectivo({
        id: 4,
        cliente_telefono: '2302 651-250',
        total: 1000,
        modalidad: 'RETIRO',
        items: [{ cantidad: 1, articulo_nombre: 'Pizza', subtotal: 1000 }],
    });

    assert.equal(sentTo, '5492302651250');
});
