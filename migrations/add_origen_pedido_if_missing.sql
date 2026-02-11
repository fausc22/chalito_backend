-- Agregar origen_pedido a pedidos si no existe (compatibilidad)
-- Ejecutar solo si la columna no existe

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pedidos'
    AND COLUMN_NAME = 'origen_pedido'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN origen_pedido ENUM(''MOSTRADOR'',''TELEFONO'',''WHATSAPP'',''WEB'') NOT NULL DEFAULT ''MOSTRADOR'' AFTER cliente_email',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
