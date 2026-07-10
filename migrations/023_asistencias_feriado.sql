-- Migracion: 023_asistencias_feriado.sql
-- Agrega flag es_feriado para liquidacion a valor doble en turnos marcados como feriado.

ALTER TABLE empleados_asistencias
    ADD COLUMN es_feriado TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 si el turno fue trabajado en feriado (liquidacion a valor doble)'
    AFTER minutos_trabajados;
