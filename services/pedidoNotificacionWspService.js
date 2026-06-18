const { enviarWhatsApp, estaConectado } = require('./whatsappService');
const whatsappSettingsService = require('./whatsappSettingsService');
const { loadPedidoWhatsAppContext } = require('./pedidoContenidoLoader');
const {
    buildWhatsAppMessage,
    normalizeMedioPago,
    isAliasTransferenciaValido,
} = require('./whatsappMessageBuilder');

async function assertPuedeEnviar() {
    const settings = await whatsappSettingsService.getSettings();
    if (!settings.notificacionesActivas) {
        return { skip: true, settings };
    }
    if (!estaConectado()) {
        throw new Error('WhatsApp no esta conectado');
    }
    return { skip: false, settings };
}

async function notificarPedidoWhatsApp({
    medioPago,
    id,
    cliente_telefono,
    total,
    modalidad,
    items = [],
}) {
    const check = await assertPuedeEnviar();
    if (check.skip) {
        console.log(`[WA] Notificaciones desactivadas, omitiendo pedido #${id}`);
        return null;
    }

    const { settings } = check;
    const mp = normalizeMedioPago(medioPago);

    if (mp === 'TRANSFERENCIA' && !isAliasTransferenciaValido(settings.aliasTransferencia)) {
        console.warn(`[WA] Alias no configurado, omitiendo notificacion transferencia pedido #${id}`);
        return null;
    }

    const mensaje = buildWhatsAppMessage({
        medioPago: mp,
        modalidad,
        id,
        items,
        total,
        local: settings.nombreNegocio,
        alias: settings.aliasTransferencia,
        plantillas: settings.plantillas,
    });

    return enviarWhatsApp(cliente_telefono, mensaje);
}

async function notificarPedidoEfectivo(params) {
    return notificarPedidoWhatsApp({ ...params, medioPago: 'EFECTIVO' });
}

async function notificarPedidoTransferencia(params) {
    return notificarPedidoWhatsApp({ ...params, medioPago: 'TRANSFERENCIA' });
}

async function notificarPedidoMercadoPagoAprobado(params) {
    return notificarPedidoWhatsApp({ ...params, medioPago: 'MERCADOPAGO' });
}

async function notificarPedidoMercadoPagoAprobadoPorId(pedidoId, connection = null) {
    const ctx = await loadPedidoWhatsAppContext(pedidoId, connection);
    if (!ctx?.cliente_telefono) {
        console.warn(`[WA] Pedido #${pedidoId} sin telefono, omitiendo notificacion MP`);
        return null;
    }
    return notificarPedidoMercadoPagoAprobado({
        id: ctx.id,
        cliente_telefono: ctx.cliente_telefono,
        total: ctx.total,
        modalidad: ctx.modalidad,
        items: ctx.items,
    });
}

module.exports = {
    notificarPedidoWhatsApp,
    notificarPedidoEfectivo,
    notificarPedidoTransferencia,
    notificarPedidoMercadoPagoAprobado,
    notificarPedidoMercadoPagoAprobadoPorId,
};
