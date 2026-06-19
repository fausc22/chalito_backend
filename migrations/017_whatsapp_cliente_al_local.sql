-- WhatsApp cliente -> local (carta online): flag, numero y plantilla
-- Fase 0: desactivar notificaciones automaticas local -> cliente

UPDATE configuracion_sistema
SET valor = 'false', tipo = 'BOOLEAN'
WHERE clave = 'WHATSAPP_NOTIFICACIONES_ACTIVAS';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_CLIENTE_ENVIA_AL_LOCAL', 'false', 'BOOLEAN',
       'Cliente abre WhatsApp hacia el local con resumen del pedido web (carta online)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_CLIENTE_ENVIA_AL_LOCAL'
);

UPDATE configuracion_sistema
SET tipo = 'BOOLEAN',
    descripcion = 'Cliente abre WhatsApp hacia el local con resumen del pedido web (carta online)'
WHERE clave = 'WHATSAPP_CLIENTE_ENVIA_AL_LOCAL';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_NUMERO_CONTACTO', '5492302633818', 'STRING',
       'Numero WhatsApp del local para wa.me (solo digitos, ej. 5492302633818). Vacio = sesion Baileys'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_NUMERO_CONTACTO'
);

UPDATE configuracion_sistema
SET valor = '5492302633818',
    tipo = 'STRING',
    descripcion = 'Numero WhatsApp del local para wa.me (solo digitos, ej. 5492302633818). Vacio = sesion Baileys'
WHERE clave = 'WHATSAPP_NUMERO_CONTACTO';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_TEMPLATE_CLIENTE_AL_LOCAL',
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
'Plantilla mensaje cliente->local (carta online). Ver placeholders en documentacion admin.'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_AL_LOCAL'
);

UPDATE configuracion_sistema
SET valor = 'Hola! soy {{cliente}}, quiero hacer un pedido para {{modalidad}}

{{bloque_retiro}}{{bloque_entrega}}{{bloque_horario}}

Mi pedido:

{{contenido}}

{{bloque_descuento}}Total pedido: {{total}}

Forma de pago: {{medio_pago}}
{{bloque_abono}}{{bloque_transferencia}}{{bloque_mercadopago}}

Pedido: {{codigo_pedido}}

Si no te contestamos en la brevedad es porque estamos ocupados. Por favor, aguardá un momento.

¡Gracias por elegirnos!',
    tipo = 'STRING',
    descripcion = 'Plantilla mensaje cliente->local (carta online). Ver placeholders en documentacion admin.'
WHERE clave = 'WHATSAPP_TEMPLATE_CLIENTE_AL_LOCAL';
