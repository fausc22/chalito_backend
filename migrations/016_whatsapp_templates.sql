-- Plantillas WhatsApp editables (6 combinaciones pago x modalidad)
-- Las claves WHATSAPP_PLANTILLA_* de la migracion 010 quedan obsoletas; no se eliminan.

-- WHATSAPP_TEMPLATE_EFECTIVO_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_EFECTIVO_RETIRO',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Confirmamos tu pedido y ya lo estamos preparando. Te esperamos en el local para retirarlo. El pago es en efectivo al momento del retiro.',
'STRING',
'Plantilla WhatsApp efectivo retiro. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_EFECTIVO_RETIRO'
);

-- WHATSAPP_TEMPLATE_EFECTIVO_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_EFECTIVO_DELIVERY',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Confirmamos tu pedido y ya lo estamos preparando. El pago es en efectivo al recibirlo. El costo del envio lo cobra el cadete al momento de la entrega y no esta incluido en el total indicado arriba.',
'STRING',
'Plantilla WhatsApp efectivo delivery. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_EFECTIVO_DELIVERY'
);

-- WHATSAPP_TEMPLATE_TRANSFERENCIA_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_TRANSFERENCIA_RETIRO',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Para confirmar el pedido, transferi el total al alias {{alias}} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. Podes retirarlo en el local.',
'STRING',
'Plantilla WhatsApp transferencia retiro. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}, {{alias}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_TRANSFERENCIA_RETIRO'
);

-- WHATSAPP_TEMPLATE_TRANSFERENCIA_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_TRANSFERENCIA_DELIVERY',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Para confirmar el pedido, transferi el total al alias {{alias}} y envianos el comprobante por este WhatsApp. Una vez confirmado el pago, lo preparamos. El envio lo coordina el cadete y su costo se abona aparte al momento de la entrega.',
'STRING',
'Plantilla WhatsApp transferencia delivery. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}, {{alias}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_TRANSFERENCIA_DELIVERY'
);

-- WHATSAPP_TEMPLATE_MERCADOPAGO_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_MERCADOPAGO_RETIRO',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. Te esperamos en el local para retirarlo.',
'STRING',
'Plantilla WhatsApp Mercado Pago retiro. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_MERCADOPAGO_RETIRO'
);

-- WHATSAPP_TEMPLATE_MERCADOPAGO_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_MERCADOPAGO_DELIVERY',
'¡Hola! Te saluda {{local}}.

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Tu pago con Mercado Pago fue acreditado correctamente. Ya estamos preparando tu pedido. El costo del envio lo cobrara el cadete al momento de la entrega y no esta incluido en el total indicado arriba.',
'STRING',
'Plantilla WhatsApp Mercado Pago delivery. Placeholders: {{id}}, {{contenido}}, {{total}}, {{local}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_MERCADOPAGO_DELIVERY'
);
