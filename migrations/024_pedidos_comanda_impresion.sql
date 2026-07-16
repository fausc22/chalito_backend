-- Registro de impresión de comanda de cocina (ticket kitchen)
-- Aditivo y compatible: pedidos históricos quedan con 0 impresiones / NULL.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'comanda_impresa_en'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN comanda_impresa_en DATETIME NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'comanda_impresiones'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN comanda_impresiones INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'comanda_ultima_impresion_usuario_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN comanda_ultima_impresion_usuario_id BIGINT UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'comanda_ultima_impresion_usuario_nombre'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN comanda_ultima_impresion_usuario_nombre VARCHAR(150) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
