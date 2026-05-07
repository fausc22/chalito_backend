const { enviarWhatsApp } = require('./whatsappService');

function formatCurrencyArs(value) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(amount);
}

function getNombreLocal() {
    return (process.env.NOMBRE_LOCAL || 'El Chalito').trim();
}

function getAliasTransferencia() {
    return (process.env.ALIAS_TRANSFERENCIA || 'ALIAS.NO.CONFIGURADO').trim();
}

async function notificarPedidoEfectivo({ id, cliente_telefono, total }) {
    const local = getNombreLocal();
    const monto = formatCurrencyArs(total);
    const mensaje = [
        `Hola! ${local} te confirma el pedido #${id}.`,
        'Ya lo estamos preparando.',
        `Total de productos: ${monto}.`,
        'Recorda que el envio lo cobra el cadete aparte y no esta incluido en ese total.',
        'Abonas en efectivo al recibir tu pedido.'
    ].join('\n');

    return enviarWhatsApp(cliente_telefono, mensaje);
}

async function notificarPedidoTransferencia({ id, cliente_telefono, total }) {
    const local = getNombreLocal();
    const alias = getAliasTransferencia();
    const monto = formatCurrencyArs(total);
    const mensaje = [
        `Hola! ${local} recibio tu pedido #${id}.`,
        `Para comenzar a prepararlo, transferi ${monto} al alias: ${alias}.`,
        'Cuando hagas la transferencia, comparti el comprobante por este WhatsApp.',
        'El envio lo cobra el cadete aparte y no se suma al total de productos.'
    ].join('\n');

    return enviarWhatsApp(cliente_telefono, mensaje);
}

async function notificarPedidoMercadoPagoAprobado({ id, cliente_telefono, total }) {
    const local = getNombreLocal();
    const monto = formatCurrencyArs(total);
    const mensaje = [
        `Hola! ${local} te confirma el pedido #${id}.`,
        'Tu pago por Mercado Pago fue aprobado y ya estamos preparando tu pedido.',
        `Total de productos pagado: ${monto}.`,
        'El envio lo coordina y cobra el cadete aparte.'
    ].join('\n');

    return enviarWhatsApp(cliente_telefono, mensaje);
}

module.exports = {
    notificarPedidoEfectivo,
    notificarPedidoTransferencia,
    notificarPedidoMercadoPagoAprobado
};
