-- Migración: Corregir nombres de configuración a mayúsculas
-- Fecha: 2025-01-XX
-- Descripción: Normaliza nombres de configuración para consistencia

-- Actualizar nombres de configuración a mayúsculas (si existen en minúsculas)
UPDATE configuracion_sistema SET clave = 'MAX_PEDIDOS_EN_PREPARACION' WHERE clave = 'max_pedidos_en_preparacion';
UPDATE configuracion_sistema SET clave = 'TIEMPO_BASE_PEDIDO_MINUTOS' WHERE clave = 'tiempo_base_preparacion_minutos';
UPDATE configuracion_sistema SET clave = 'DEMORA_COCINA_MANUAL_MINUTOS' WHERE clave = 'demora_cocina_minutos';
UPDATE configuracion_sistema SET clave = 'INTERVALO_WORKER_SEGUNDOS' WHERE clave = 'worker_interval_segundos';

-- Insertar configuraciones con nombres correctos si no existen
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
  ('MAX_PEDIDOS_EN_PREPARACION', '8', 'number', 'Número máximo de pedidos que pueden estar en estado EN_PREPARACION simultáneamente.')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
  ('TIEMPO_BASE_PEDIDO_MINUTOS', '15', 'number', 'Tiempo base estimado en minutos para la preparación de un pedido.')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
  ('DEMORA_COCINA_MANUAL_MINUTOS', '0', 'number', 'Demora manual adicional en minutos para la cocina. Afecta la entrada de pedidos a preparación.')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
  ('INTERVALO_WORKER_SEGUNDOS', '30', 'number', 'Intervalo en segundos en que se ejecuta el worker de automatización de pedidos.')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);








