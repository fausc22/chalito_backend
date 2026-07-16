-- Consolida MAX_PEDIDOS_EN_PREPARACION como clave canónica de capacidad de cocina.
-- Idempotente: conserva valor existente, migra legacy en minúsculas si hace falta,
-- e inserta default 8 solo si no existe ninguna de las dos claves.

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT
  'MAX_PEDIDOS_EN_PREPARACION',
  COALESCE(
    (
      SELECT valor
      FROM configuracion_sistema
      WHERE clave = 'MAX_PEDIDOS_EN_PREPARACION'
      LIMIT 1
    ),
    (
      SELECT valor
      FROM configuracion_sistema
      WHERE clave = 'max_pedidos_en_preparacion'
      LIMIT 1
    ),
    '8'
  ),
  'INT',
  'Máximo de pedidos simultáneos en preparación'
WHERE NOT EXISTS (
  SELECT 1
  FROM configuracion_sistema
  WHERE clave = 'MAX_PEDIDOS_EN_PREPARACION'
);
