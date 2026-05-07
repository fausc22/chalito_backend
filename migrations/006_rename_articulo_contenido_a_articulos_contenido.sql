-- Migración: renombrar tabla articulo_contenido -> articulos_contenido
-- Uso: mysql -u ... sistema_chalito < 006_rename_articulo_contenido_a_articulos_contenido.sql
-- O ejecutar desde un cliente SQL con la base correcta seleccionada (USE sistema_chalito;).

-- Caso simple (si NO existe ya articulos_contenido):
-- RENAME TABLE `articulo_contenido` TO `articulos_contenido`;

-- Versión segura: solo renombra si existe la tabla vieja y no existe la nueva.
DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_rename_articulo_contenido$$

CREATE PROCEDURE migrate_rename_articulo_contenido()
BEGIN
  DECLARE v_old INT DEFAULT 0;
  DECLARE v_new INT DEFAULT 0;

  SELECT COUNT(*) INTO v_old
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'articulo_contenido';

  SELECT COUNT(*) INTO v_new
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'articulos_contenido';

  IF v_old = 1 AND v_new = 0 THEN
    RENAME TABLE `articulo_contenido` TO `articulos_contenido`;
  END IF;
END$$

DELIMITER ;

CALL migrate_rename_articulo_contenido();

DROP PROCEDURE migrate_rename_articulo_contenido;

-- Notas:
-- - InnoDB mantiene las FK al renombrar; los nombres internos de los constraints no cambian.
-- - Si ya tienes ambas tablas (vieja y nueva), revisa datos antes de borrar o fusionar manualmente.
