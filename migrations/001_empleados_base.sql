-- Migracion: 001_empleados_base.sql
-- Modulo: EMPLEADOS
-- Crea la estructura base de empleados, asistencias, movimientos y liquidaciones.

-- =========================================================
-- 1) Limpieza previa (DROP TABLE IF EXISTS)
--    Se elimina primero tablas hijas y luego la tabla padre
--    para respetar las restricciones de clave foranea.
-- =========================================================

DROP TABLE IF EXISTS empleados_liquidaciones;
DROP TABLE IF EXISTS empleados_movimientos;
DROP TABLE IF EXISTS empleados_asistencias;
DROP TABLE IF EXISTS empleados;

-- =========================================================
-- Tabla: empleados
-- Proposito:
--   Guarda la informacion principal de cada empleado.
-- Uso en el sistema:
--   Es la tabla base del modulo y se usa para calculos,
--   asistencias, movimientos y liquidaciones.
-- Relaciones principales:
--   1:N con empleados_asistencias, empleados_movimientos
--   y empleados_liquidaciones.
-- =========================================================

CREATE TABLE empleados (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(30) NULL,
    email VARCHAR(150) NULL,
    documento VARCHAR(30) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    tipo_pago ENUM('POR_HORA', 'POR_TURNO') NOT NULL,
    valor_hora DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    valor_turno DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    fecha_ingreso DATE NOT NULL,
    observaciones TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_empleados_documento (documento),
    UNIQUE KEY uq_empleados_email (email),
    KEY idx_empleados_activo (activo),
    KEY idx_empleados_tipo_pago (tipo_pago)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Tabla: empleados_asistencias
-- Proposito:
--   Registra cada jornada de asistencia de un empleado.
-- Uso en el sistema:
--   Permite calcular minutos trabajados y controlar estados
--   de registro de ingreso/egreso.
-- Relaciones principales:
--   N:1 con empleados mediante empleado_id.
-- =========================================================

CREATE TABLE empleados_asistencias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    empleado_id BIGINT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    hora_ingreso DATETIME NULL,
    hora_egreso DATETIME NULL,
    minutos_trabajados INT UNSIGNED NOT NULL DEFAULT 0,
    estado ENUM('ABIERTO', 'CERRADO', 'CORREGIDO', 'ANULADO') NOT NULL DEFAULT 'ABIERTO',
    registrado_por_usuario_id BIGINT UNSIGNED NULL,
    corregido_por_usuario_id BIGINT UNSIGNED NULL,
    observaciones TEXT NULL,
    motivo_correccion TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_empleados_asistencias_empleado_fecha (empleado_id, fecha),
    KEY idx_empleados_asistencias_estado (estado),
    CONSTRAINT fk_empleados_asistencias_empleado
        FOREIGN KEY (empleado_id) REFERENCES empleados(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Tabla: empleados_movimientos
-- Proposito:
--   Registra movimientos economicos asociados al empleado.
-- Uso en el sistema:
--   Se utiliza para ajustar liquidaciones con adelantos,
--   descuentos, bonos y consumos.
-- Relaciones principales:
--   N:1 con empleados mediante empleado_id.
-- =========================================================

CREATE TABLE empleados_movimientos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    empleado_id BIGINT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    tipo ENUM('ADELANTO', 'DESCUENTO', 'BONO', 'CONSUMO') NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    observaciones TEXT NULL,
    registrado_por_usuario_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_empleados_movimientos_empleado_fecha (empleado_id, fecha),
    KEY idx_empleados_movimientos_tipo (tipo),
    CONSTRAINT fk_empleados_movimientos_empleado
        FOREIGN KEY (empleado_id) REFERENCES empleados(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Tabla: empleados_liquidaciones
-- Proposito:
--   Almacena el resumen final de liquidacion por periodo.
-- Uso en el sistema:
--   Consolida asistencias y movimientos para obtener el total
--   a pagar al empleado en un rango de fechas.
-- Relaciones principales:
--   N:1 con empleados mediante empleado_id.
-- =========================================================

CREATE TABLE empleados_liquidaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    empleado_id BIGINT UNSIGNED NOT NULL,
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    total_asistencias INT UNSIGNED NOT NULL DEFAULT 0,
    total_minutos INT UNSIGNED NOT NULL DEFAULT 0,
    total_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_bonos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_descuentos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_adelantos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_consumos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_final DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado ENUM('BORRADOR', 'CERRADA', 'PAGADA', 'ANULADA') NOT NULL DEFAULT 'BORRADOR',
    observaciones TEXT NULL,
    generado_por_usuario_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_empleados_liquidaciones_empleado_rango (empleado_id, fecha_desde, fecha_hasta),
    CONSTRAINT fk_empleados_liquidaciones_empleado
        FOREIGN KEY (empleado_id) REFERENCES empleados(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
