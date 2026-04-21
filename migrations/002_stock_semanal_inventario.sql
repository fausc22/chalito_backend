-- Migracion: 002_stock_semanal_inventario.sql
-- Modulo: INVENTARIO / Stock semanal
-- Crea insumos configurables, semanas de stock y detalle por insumo.
-- No modifica tablas de otros modulos.
-- Limpieza previa solo de tablas de este submodulo (orden: hijas primero).

DROP TABLE IF EXISTS semanas_stock_detalle;
DROP TABLE IF EXISTS semanas_stock;
DROP TABLE IF EXISTS insumos_semanales;

-- =========================================================
-- Tabla: insumos_semanales
-- Proposito:
--   Catalogo de insumos controlados en el stock semanal manual.
-- Uso:
--   Filas activas se eligen al armar detalle de una semana.
-- =========================================================

CREATE TABLE insumos_semanales (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_insumos_semanales_activo (activo),
    KEY idx_insumos_semanales_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Insumos configurables para el control semanal de stock';

-- =========================================================
-- Tabla: semanas_stock
-- Proposito:
--   Una fila por periodo semanal (fecha_inicio / fecha_fin).
-- Regla de negocio:
--   Solo una semana en estado ABIERTA a la vez: columna solo_abierta_marcador (1 si ABIERTA, NULL si no)
--   + UNIQUE(solo_abierta_marcador). En MySQL, varias filas NULL no violan el unico.
-- Notas:
--   creada_por_usuario_id / cerrada_por_usuario_id referencian usuarios del sistema (sin FK en BD, igual que modulo empleados).
-- =========================================================

CREATE TABLE semanas_stock (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado ENUM('ABIERTA', 'CERRADA') NOT NULL DEFAULT 'ABIERTA',
    observaciones TEXT NULL,
    creada_por_usuario_id BIGINT UNSIGNED NOT NULL,
    cerrada_por_usuario_id BIGINT UNSIGNED NULL,
    fecha_cierre DATETIME NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    solo_abierta_marcador TINYINT UNSIGNED GENERATED ALWAYS AS (IF(estado = 'ABIERTA', 1, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_semanas_stock_solo_una_abierta (solo_abierta_marcador),
    KEY idx_semanas_stock_rango (fecha_inicio, fecha_fin),
    KEY idx_semanas_stock_estado (estado),
    KEY idx_semanas_stock_creada_por (creada_por_usuario_id),
    CONSTRAINT chk_semanas_stock_rango CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Semanas de stock manual (abierta o cerrada)';

-- =========================================================
-- Tabla: semanas_stock_detalle
-- Proposito:
--   Por cada semana, cantidades por insumo: inicial, final y consumo.
-- Consumo:
--   consumo_calculado = stock_inicial - stock_final (columna generada almacenada cuando ambos valores estan cargados).
-- =========================================================

CREATE TABLE semanas_stock_detalle (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    semana_stock_id BIGINT UNSIGNED NOT NULL,
    insumo_semanal_id BIGINT UNSIGNED NOT NULL,
    stock_inicial INT UNSIGNED NULL,
    stock_final INT UNSIGNED NULL,
    consumo_calculado INT GENERATED ALWAYS AS (
        IF(
            stock_inicial IS NOT NULL AND stock_final IS NOT NULL,
            CAST(stock_inicial AS SIGNED) - CAST(stock_final AS SIGNED),
            NULL
        )
    ) STORED NULL,
    observaciones TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_semanas_stock_detalle_semana_insumo (semana_stock_id, insumo_semanal_id),
    KEY idx_semanas_stock_detalle_insumo (insumo_semanal_id),
    CONSTRAINT fk_semanas_stock_detalle_semana
        FOREIGN KEY (semana_stock_id) REFERENCES semanas_stock (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_semanas_stock_detalle_insumo
        FOREIGN KEY (insumo_semanal_id) REFERENCES insumos_semanales (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Lineas de insumo por semana de stock';

-- =========================================================
-- Datos iniciales: 5 insumos por defecto del flujo semanal
-- =========================================================

INSERT INTO insumos_semanales (nombre, descripcion, activo) VALUES
    ('panes de burger', 'Stock semanal de panes para hamburguesas', 1),
    ('panes de sándwich', 'Stock semanal de panes para sándwiches', 1),
    ('tapas de empanadas', 'Tapas para empanadas', 1),
    ('bandejas de papas', 'Bandejas de papas', 1),
    ('bolsas de papas', 'Bolsas de papas', 1);
