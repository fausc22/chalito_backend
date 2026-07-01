-- Migracion: 020_empleados_asistencias_ajustes.sql
-- Modulo: EMPLEADOS
-- Historial inmutable de ajustes manuales de hora de ingreso en asistencias.

CREATE TABLE IF NOT EXISTS empleados_asistencias_ajustes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    asistencia_id BIGINT UNSIGNED NOT NULL,
    empleado_id BIGINT UNSIGNED NOT NULL,
    hora_ingreso_anterior DATETIME NOT NULL,
    hora_ingreso_nueva DATETIME NOT NULL,
    minutos_trabajados_anterior INT UNSIGNED NULL,
    minutos_trabajados_nuevo INT UNSIGNED NULL,
    motivo TEXT NULL,
    ajustado_por_usuario_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_asistencias_ajustes_asistencia (asistencia_id),
    KEY idx_asistencias_ajustes_empleado (empleado_id, created_at),
    CONSTRAINT fk_asistencias_ajustes_asistencia
        FOREIGN KEY (asistencia_id) REFERENCES empleados_asistencias(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_asistencias_ajustes_empleado
        FOREIGN KEY (empleado_id) REFERENCES empleados(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
