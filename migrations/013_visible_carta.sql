-- Agregar visible_carta a categorias
ALTER TABLE categorias
  ADD COLUMN visible_carta TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Controla si la categoría aparece en la carta online';

-- Agregar visible_carta a articulos
ALTER TABLE articulos
  ADD COLUMN visible_carta TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Controla si el artículo aparece en la carta online';
