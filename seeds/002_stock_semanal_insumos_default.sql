-- =========================================================
-- Seed: 002_stock_semanal_insumos_default.sql
-- Modulo: INVENTARIO / Stock semanal
--
-- Inserta los 5 insumos semanales por defecto si aun no existen
-- (misma lista que la migracion 002). Util para entornos donde
-- se creo la estructura sin correr el bloque INSERT o para reparar datos.
-- =========================================================

START TRANSACTION;

INSERT INTO insumos_semanales (nombre, descripcion, activo)
SELECT 'panes de burger', 'Stock semanal de panes para hamburguesas', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM insumos_semanales WHERE nombre = 'panes de burger');

INSERT INTO insumos_semanales (nombre, descripcion, activo)
SELECT 'panes de sándwich', 'Stock semanal de panes para sándwiches', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM insumos_semanales WHERE nombre = 'panes de sándwich');

INSERT INTO insumos_semanales (nombre, descripcion, activo)
SELECT 'tapas de empanadas', 'Tapas para empanadas', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM insumos_semanales WHERE nombre = 'tapas de empanadas');

INSERT INTO insumos_semanales (nombre, descripcion, activo)
SELECT 'bandejas de papas', 'Bandejas de papas', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM insumos_semanales WHERE nombre = 'bandejas de papas');

INSERT INTO insumos_semanales (nombre, descripcion, activo)
SELECT 'bolsas de papas', 'Bolsas de papas', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM insumos_semanales WHERE nombre = 'bolsas de papas');

COMMIT;
