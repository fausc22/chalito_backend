-- Migración: 015_adicionales_permite_cantidad.sql
-- Permite que ciertos adicionales acepten cantidad en la carta online (ej. Extra Cheddar x2)

SET @has_permite_cantidad := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'adicionales'
    AND COLUMN_NAME = 'permite_cantidad'
);

SET @sql_add_permite_cantidad := IF(
  @has_permite_cantidad = 0,
  'ALTER TABLE adicionales ADD COLUMN permite_cantidad TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Si 1, el cliente puede elegir cantidad del adicional en la carta online'' AFTER disponible',
  'SELECT 1'
);
PREPARE stmt_add_permite_cantidad FROM @sql_add_permite_cantidad;
EXECUTE stmt_add_permite_cantidad;
DEALLOCATE PREPARE stmt_add_permite_cantidad;
