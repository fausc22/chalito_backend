-- Rebrand carrito: azul/cyan -> negro/naranja (defaults de marca)

UPDATE configuracion_sistema
SET valor = '#0D0D0D'
WHERE clave = 'TIENDA_COLOR_PRIMARIO'
  AND valor IN ('#1D4ED8', '#1d4ed8');

UPDATE configuracion_sistema
SET valor = '#EA580C'
WHERE clave = 'TIENDA_COLOR_SECUNDARIO'
  AND valor IN ('#88E1F2', '#88e1f2');
