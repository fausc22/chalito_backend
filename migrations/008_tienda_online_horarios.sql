-- Fase 1: horarios tienda online + claves de configuracion del canal
-- Idempotente donde aplica

CREATE TABLE IF NOT EXISTS `horarios_tienda` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dia_semana` tinyint NOT NULL COMMENT '0=Domingo..6=Sabado',
  `hora_apertura` time NOT NULL,
  `hora_cierre` time NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `orden` tinyint DEFAULT '0',
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_horarios_dia_orden` (`dia_semana`, `orden`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed horarios (solo si la tabla esta vacia)
INSERT INTO `horarios_tienda` (`dia_semana`, `hora_apertura`, `hora_cierre`, `activo`, `orden`)
SELECT * FROM (
  SELECT 0 AS dia_semana, '17:00:00' AS hora_apertura, '23:30:00' AS hora_cierre, 1 AS activo, 0 AS orden
  UNION ALL SELECT 3, '10:00:00', '13:00:00', 1, 0
  UNION ALL SELECT 3, '18:00:00', '23:00:00', 1, 1
  UNION ALL SELECT 4, '10:00:00', '13:00:00', 1, 0
  UNION ALL SELECT 4, '18:00:00', '23:00:00', 1, 1
  UNION ALL SELECT 5, '10:00:00', '13:00:00', 1, 0
  UNION ALL SELECT 5, '17:00:00', '23:30:00', 1, 1
  UNION ALL SELECT 6, '17:00:00', '23:30:00', 1, 0
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `horarios_tienda` LIMIT 1);

-- TIENDA_ONLINE_ACTIVA
UPDATE configuracion_sistema
SET valor = CASE
        WHEN valor IN ('true', 'false', '1', '0') THEN valor
        ELSE 'true'
    END,
    tipo = 'BOOLEAN',
    descripcion = 'Canal de tienda online activo (cierre manual)'
WHERE clave = 'TIENDA_ONLINE_ACTIVA';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'TIENDA_ONLINE_ACTIVA', 'true', 'BOOLEAN', 'Canal de tienda online activo (cierre manual)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'TIENDA_ONLINE_ACTIVA'
);

-- VALIDAR_HORARIOS_CHECKOUT
UPDATE configuracion_sistema
SET valor = CASE
        WHEN valor IN ('true', 'false', '1', '0') THEN valor
        ELSE 'true'
    END,
    tipo = 'BOOLEAN',
    descripcion = 'Validar horarios de atencion en checkout web'
WHERE clave = 'VALIDAR_HORARIOS_CHECKOUT';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'VALIDAR_HORARIOS_CHECKOUT', 'true', 'BOOLEAN', 'Validar horarios de atencion en checkout web'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'VALIDAR_HORARIOS_CHECKOUT'
);

-- TOLERANCIA_CIERRE_MINUTOS
UPDATE configuracion_sistema
SET valor = COALESCE(NULLIF(valor, ''), '5'),
    tipo = 'INT',
    descripcion = 'Minutos de tolerancia despues del cierre de franja'
WHERE clave = 'TOLERANCIA_CIERRE_MINUTOS';

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'TOLERANCIA_CIERRE_MINUTOS', '5', 'INT', 'Minutos de tolerancia despues del cierre de franja'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'TOLERANCIA_CIERRE_MINUTOS'
);
