-- Migración: renombrar tabla articulo_contenido -> articulos_contenido
-- Idempotente, compatible con runMigrations.js (sin DELIMITER/procedures)

SET @rename_sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'articulo_contenido'
  ) = 1
  AND (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'articulos_contenido'
  ) = 0,
  'RENAME TABLE `articulo_contenido` TO `articulos_contenido`',
  'SELECT 1'
);

PREPARE rename_stmt FROM @rename_sql;
EXECUTE rename_stmt;
DEALLOCATE PREPARE rename_stmt;
