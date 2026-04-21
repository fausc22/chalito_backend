-- Migracion: 003_articulos_controla_stock.sql
-- Modulo: ARTICULOS / Inventario base
-- Regla funcional:
--   ELABORADO -> controla_stock = FALSE
--   BEBIDA    -> controla_stock = TRUE
--   OTRO      -> controla_stock = TRUE

ALTER TABLE articulos
    ADD COLUMN controla_stock BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE articulos
SET controla_stock = FALSE
WHERE UPPER(COALESCE(tipo, '')) = 'ELABORADO';

UPDATE articulos
SET controla_stock = TRUE
WHERE UPPER(COALESCE(tipo, '')) = 'BEBIDA';

UPDATE articulos
SET controla_stock = TRUE
WHERE UPPER(COALESCE(tipo, '')) = 'OTRO';

UPDATE articulos
SET controla_stock = TRUE
WHERE UPPER(COALESCE(tipo, '')) NOT IN ('ELABORADO', 'BEBIDA', 'OTRO');
