SET @has_avatar_key := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'avatar_key'
);

SET @sql_add_avatar_key := IF(
  @has_avatar_key = 0,
  'ALTER TABLE usuarios ADD COLUMN avatar_key VARCHAR(50) NULL AFTER rol',
  'SELECT 1'
);
PREPARE stmt_add_avatar_key FROM @sql_add_avatar_key;
EXECUTE stmt_add_avatar_key;
DEALLOCATE PREPARE stmt_add_avatar_key;

SET @has_ultima_conexion := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'ultima_conexion'
);

SET @sql_add_ultima_conexion := IF(
  @has_ultima_conexion = 0,
  'ALTER TABLE usuarios ADD COLUMN ultima_conexion DATETIME NULL AFTER fecha_modificacion',
  'SELECT 1'
);
PREPARE stmt_add_ultima_conexion FROM @sql_add_ultima_conexion;
EXECUTE stmt_add_ultima_conexion;
DEALLOCATE PREPARE stmt_add_ultima_conexion;
