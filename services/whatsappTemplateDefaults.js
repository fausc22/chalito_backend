const TEMPLATE_KEYS = [
    'EFECTIVO_RETIRO',
    'EFECTIVO_DELIVERY',
    'TRANSFERENCIA_RETIRO',
    'TRANSFERENCIA_DELIVERY',
    'MERCADOPAGO_RETIRO',
    'MERCADOPAGO_DELIVERY',
];

const TEMPLATE_DB_KEYS = {
    EFECTIVO_RETIRO: 'WHATSAPP_TEMPLATE_EFECTIVO_RETIRO',
    EFECTIVO_DELIVERY: 'WHATSAPP_TEMPLATE_EFECTIVO_DELIVERY',
    TRANSFERENCIA_RETIRO: 'WHATSAPP_TEMPLATE_TRANSFERENCIA_RETIRO',
    TRANSFERENCIA_DELIVERY: 'WHATSAPP_TEMPLATE_TRANSFERENCIA_DELIVERY',
    MERCADOPAGO_RETIRO: 'WHATSAPP_TEMPLATE_MERCADOPAGO_RETIRO',
    MERCADOPAGO_DELIVERY: 'WHATSAPP_TEMPLATE_MERCADOPAGO_DELIVERY',
};

const CLIENTE_LOCAL_TEMPLATE_DB_KEYS = {
    EFECTIVO_RETIRO: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_RETIRO',
    EFECTIVO_DELIVERY: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_DELIVERY',
    TRANSFERENCIA_RETIRO: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_RETIRO',
    TRANSFERENCIA_DELIVERY: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_DELIVERY',
    MERCADOPAGO_RETIRO: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_RETIRO',
    MERCADOPAGO_DELIVERY: 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_DELIVERY',
};

const TEMPLATE_LABELS = {
    EFECTIVO_RETIRO: 'Efectivo — Retiro en local',
    EFECTIVO_DELIVERY: 'Efectivo — Envío a domicilio',
    TRANSFERENCIA_RETIRO: 'Transferencia — Retiro en local',
    TRANSFERENCIA_DELIVERY: 'Transferencia — Envío a domicilio',
    MERCADOPAGO_RETIRO: 'Mercado Pago — Retiro en local',
    MERCADOPAGO_DELIVERY: 'Mercado Pago — Envío a domicilio',
};

const DEFAULT_TEMPLATES = {
    EFECTIVO_RETIRO: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Confirmamos tu pedido y ya lo estamos preparando. Te esperamos en el local para retirarlo. El pago es en efectivo al momento del retiro.`,

    EFECTIVO_DELIVERY: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Confirmamos tu pedido y ya lo estamos preparando. El pago es en efectivo al recibirlo. El costo del envio lo cobra el cadete al momento de la entrega y no esta incluido en el total indicado arriba.`,

    TRANSFERENCIA_RETIRO: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Para confirmar el pedido, transferi el total al alias {{alias}} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. Podes retirarlo en el local.`,

    TRANSFERENCIA_DELIVERY: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Para confirmar el pedido, transferi el total al alias {{alias}} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. El envio lo coordina el cadete y su costo se abona aparte al momento de la entrega.`,

    MERCADOPAGO_RETIRO: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. Te esperamos en el local para retirarlo.`,

    MERCADOPAGO_DELIVERY: `¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. El costo del envio lo cobrara el cadete al momento de la entrega y no esta incluido en el total indicado arriba.`,
};

const REQUIRED_PLACEHOLDERS_ALL = ['{{id}}', '{{contenido}}', '{{total}}'];
const REQUIRED_PLACEHOLDERS_TRANSFERENCIA = ['{{alias}}'];

const MOCK_ITEMS = [
    {
        cantidad: 2,
        articulo_nombre: 'Milanesa napolitana',
        personalizaciones: { extras: [{ nombre: 'Papas fritas' }] },
    },
    { cantidad: 1, articulo_nombre: 'Gaseosa 1.5L' },
];

const DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL = `Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!`;

const REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL = [
    'cliente',
    'modalidad',
    'contenido',
    'total',
    'medio_pago',
    'codigo_pedido',
];

const CLIENTE_AL_LOCAL_PLACEHOLDERS = [
    ...REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL,
    'subtotal',
    'bloque_retiro',
    'bloque_entrega',
    'bloque_horario',
    'bloque_descuento',
    'bloque_abono',
    'bloque_transferencia',
    'bloque_mercadopago',
    'alias',
    'cupon',
    'descuento',
    'horario',
    'telefono',
    'id',
    'local',
];

const getDefaultTemplatesCopy = () => ({ ...DEFAULT_TEMPLATES });

const buildDefaultClienteLocalTemplates = () => {
    const copy = {};
    for (const key of TEMPLATE_KEYS) {
        copy[key] = DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL;
    }
    return copy;
};

const DEFAULT_TEMPLATES_CLIENTE_LOCAL = buildDefaultClienteLocalTemplates();

const getDefaultClienteLocalTemplatesCopy = () => ({ ...DEFAULT_TEMPLATES_CLIENTE_LOCAL });

module.exports = {
    TEMPLATE_KEYS,
    TEMPLATE_DB_KEYS,
    CLIENTE_LOCAL_TEMPLATE_DB_KEYS,
    TEMPLATE_LABELS,
    DEFAULT_TEMPLATES,
    DEFAULT_TEMPLATES_CLIENTE_LOCAL,
    REQUIRED_PLACEHOLDERS_ALL,
    REQUIRED_PLACEHOLDERS_TRANSFERENCIA,
    MOCK_ITEMS,
    DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL,
    CLIENTE_AL_LOCAL_PLACEHOLDERS,
    getDefaultTemplatesCopy,
    getDefaultClienteLocalTemplatesCopy,
};
