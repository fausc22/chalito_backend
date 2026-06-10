-- Carrusel hero configurable para inicio de carta online

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT
    'TIENDA_HERO_CAROUSEL',
    '{"enabled":true,"slides":[],"updatedAt":null}',
    'JSON',
    'Carrusel hero del inicio de la tienda web (carrito)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'TIENDA_HERO_CAROUSEL'
);

UPDATE configuracion_sistema
SET tipo = 'JSON',
    descripcion = 'Carrusel hero del inicio de la tienda web (carrito)'
WHERE clave = 'TIENDA_HERO_CAROUSEL';
