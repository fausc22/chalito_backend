-- Imagen configurable de la card de categoría en la carta online.
-- NULL = la carta usa la imagen automática (foto de un artículo de la categoría).
ALTER TABLE categorias
  ADD COLUMN imagen_url VARCHAR(500) NULL DEFAULT NULL
  COMMENT 'Imagen de la card de la categoría en la carta online'
  AFTER descripcion;
