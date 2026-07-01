-- Migracion: 021_empleados_asistencias_ajustes_motivo_nullable.sql
-- Modulo: EMPLEADOS
-- Asegura motivo opcional en historial de ajustes (entornos que corrieron 020 con NOT NULL).

ALTER TABLE empleados_asistencias_ajustes
    MODIFY COLUMN motivo TEXT NULL;
