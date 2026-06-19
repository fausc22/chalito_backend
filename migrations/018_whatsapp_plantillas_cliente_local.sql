-- Plantillas WhatsApp cliente→local (6 combinaciones pago x modalidad)
-- NO destructiva: solo INSERT WHERE NOT EXISTS. No modifica plantillas local→cliente existentes.

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_RETIRO',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: efectivo retiro (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_RETIRO'
);

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_DELIVERY',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: efectivo delivery (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_EFECTIVO_DELIVERY'
);

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_RETIRO',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: transferencia retiro (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_RETIRO'
);

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_DELIVERY',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: transferencia delivery (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_TRANSFERENCIA_DELIVERY'
);

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_RETIRO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_RETIRO',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: Mercado Pago retiro (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_RETIRO'
);

-- WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_DELIVERY
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_DELIVERY',
'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
'STRING',
'Plantilla cliente→local: Mercado Pago delivery (carta online wa.me)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_LOCAL_MERCADOPAGO_DELIVERY'
);
