-- Fase 3: configuracion WhatsApp (notificaciones pedidos web)

-- Ampliar columna valor para plantillas multilinea
SET @col_type = (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'configuracion_sistema'
    AND COLUMN_NAME = 'valor'
);
SET @sql_valor = IF(@col_type = 'varchar',
  'ALTER TABLE configuracion_sistema MODIFY COLUMN valor TEXT NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_valor;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- WHATSAPP_NOTIFICACIONES_ACTIVAS
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_NOTIFICACIONES_ACTIVAS', 'true', 'BOOLEAN', 'Enviar notificaciones WhatsApp a clientes en pedidos web'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_NOTIFICACIONES_ACTIVAS'
);

UPDATE configuracion_sistema
SET tipo = 'BOOLEAN',
    descripcion = 'Enviar notificaciones WhatsApp a clientes en pedidos web'
WHERE clave = 'WHATSAPP_NOTIFICACIONES_ACTIVAS';

-- ALIAS_TRANSFERENCIA
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'ALIAS_TRANSFERENCIA', 'ALIAS.NO.CONFIGURADO', 'STRING', 'Alias de transferencia para pedidos web'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'ALIAS_TRANSFERENCIA'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Alias de transferencia para pedidos web'
WHERE clave = 'ALIAS_TRANSFERENCIA';

-- WHATSAPP_PLANTILLA_EFECTIVO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_PLANTILLA_EFECTIVO',
'Hola! {{local}} te confirma el pedido #{{id}}.
Ya lo estamos preparando.
Total de productos: {{total}}.
Recorda que el envio lo cobra el cadete aparte y no esta incluido en ese total.
Abonas en efectivo al recibir tu pedido.',
'STRING',
'Plantilla WhatsApp pedido efectivo. Placeholders: {{id}}, {{local}}, {{total}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_PLANTILLA_EFECTIVO'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Plantilla WhatsApp pedido efectivo. Placeholders: {{id}}, {{local}}, {{total}}'
WHERE clave = 'WHATSAPP_PLANTILLA_EFECTIVO'
  AND (valor IS NULL OR valor = '');

-- WHATSAPP_PLANTILLA_TRANSFERENCIA
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_PLANTILLA_TRANSFERENCIA',
'Hola! {{local}} recibio tu pedido #{{id}}.
Para comenzar a prepararlo, transferi {{total}} al alias: {{alias}}.
Cuando hagas la transferencia, comparti el comprobante por este WhatsApp.
El envio lo cobra el cadete aparte y no se suma al total de productos.',
'STRING',
'Plantilla WhatsApp pedido transferencia. Placeholders: {{id}}, {{local}}, {{total}}, {{alias}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_PLANTILLA_TRANSFERENCIA'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Plantilla WhatsApp pedido transferencia. Placeholders: {{id}}, {{local}}, {{total}}, {{alias}}'
WHERE clave = 'WHATSAPP_PLANTILLA_TRANSFERENCIA'
  AND (valor IS NULL OR valor = '');

-- WHATSAPP_PLANTILLA_MERCADOPAGO
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'WHATSAPP_PLANTILLA_MERCADOPAGO',
'Hola! {{local}} te confirma el pedido #{{id}}.
Tu pago por Mercado Pago fue aprobado y ya estamos preparando tu pedido.
Total de productos pagado: {{total}}.
El envio lo coordina y cobra el cadete aparte.',
'STRING',
'Plantilla WhatsApp pedido Mercado Pago. Placeholders: {{id}}, {{local}}, {{total}}'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'WHATSAPP_PLANTILLA_MERCADOPAGO'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Plantilla WhatsApp pedido Mercado Pago. Placeholders: {{id}}, {{local}}, {{total}}'
WHERE clave = 'WHATSAPP_PLANTILLA_MERCADOPAGO'
  AND (valor IS NULL OR valor = '');
