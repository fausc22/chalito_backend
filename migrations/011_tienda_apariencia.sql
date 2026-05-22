-- Fase 4: colores web del carrito (tienda online)

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'TIENDA_COLOR_PRIMARIO',
       COALESCE(
           (SELECT valor FROM configuracion_sistema WHERE clave = 'COLOR_PRIMARIO' LIMIT 1),
           '#1D4ED8'
       ),
       'STRING',
       'Color primario de la tienda web (carrito)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'TIENDA_COLOR_PRIMARIO'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Color primario de la tienda web (carrito)'
WHERE clave = 'TIENDA_COLOR_PRIMARIO';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'TIENDA_COLOR_SECUNDARIO', '#88E1F2', 'STRING', 'Color secundario/acento de la tienda web (carrito)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'TIENDA_COLOR_SECUNDARIO'
);

UPDATE configuracion_sistema
SET tipo = 'STRING',
    descripcion = 'Color secundario/acento de la tienda web (carrito)'
WHERE clave = 'TIENDA_COLOR_SECUNDARIO';
