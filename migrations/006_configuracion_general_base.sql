-- Configuración general base (idempotente)
-- Claves:
--   NOMBRE_NEGOCIO
--   LOGO_URL
--   COLOR_PRIMARIO
--   MODO_OSCURO

-- NOMBRE_NEGOCIO
UPDATE configuracion_sistema
SET valor = COALESCE(NULLIF(valor, ''), 'El Chalito'),
    tipo = 'STRING',
    descripcion = 'Nombre visible del negocio'
WHERE clave = 'NOMBRE_NEGOCIO';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'NOMBRE_NEGOCIO', 'El Chalito', 'STRING', 'Nombre visible del negocio'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'NOMBRE_NEGOCIO'
);

-- LOGO_URL
UPDATE configuracion_sistema
SET valor = COALESCE(valor, ''),
    tipo = 'STRING',
    descripcion = 'URL del logo institucional (uso futuro en UI)'
WHERE clave = 'LOGO_URL';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'LOGO_URL', '', 'STRING', 'URL del logo institucional (uso futuro en UI)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'LOGO_URL'
);

-- COLOR_PRIMARIO
UPDATE configuracion_sistema
SET valor = COALESCE(NULLIF(valor, ''), '#F59E0B'),
    tipo = 'STRING',
    descripcion = 'Color primario de marca (hex)'
WHERE clave = 'COLOR_PRIMARIO';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'COLOR_PRIMARIO', '#F59E0B', 'STRING', 'Color primario de marca (hex)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'COLOR_PRIMARIO'
);

-- MODO_OSCURO
UPDATE configuracion_sistema
SET valor = CASE
        WHEN valor IN ('true', 'false', '1', '0') THEN valor
        ELSE 'false'
    END,
    tipo = 'BOOLEAN',
    descripcion = 'Habilita modo oscuro para interfaz (uso futuro)'
WHERE clave = 'MODO_OSCURO';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'MODO_OSCURO', 'false', 'BOOLEAN', 'Habilita modo oscuro para interfaz (uso futuro)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'MODO_OSCURO'
);
