-- =========================================================
-- Seed: 001_empleados_test_data.sql
-- Modulo: EMPLEADOS
-- Entorno objetivo: LOCAL / TESTING
--
-- ATENCION:
-- - Este script inserta datos de prueba realistas.
-- - No modifica estructura, no borra tablas y no toca migraciones.
-- - No ejecutar en produccion sin revision previa.
-- =========================================================

START TRANSACTION;

-- =========================================================
-- Variables auxiliares de usuarios del sistema
-- (se usan para campos registrado_por_usuario_id, corregido_por_usuario_id,
--  generado_por_usuario_id)
-- =========================================================
SET @usuario_rrhh := 1;
SET @usuario_encargado := 2;

-- =========================================================
-- 1) EMPLEADOS
-- Inserta 4 empleados de testing identificables y activos.
-- =========================================================
INSERT INTO empleados (
    nombre, apellido, telefono, email, documento, activo,
    tipo_pago, valor_hora, valor_turno, fecha_ingreso, observaciones
) VALUES
    ('Ana', 'Suarez', '11-3411-2201', 'ana.suarez.testing@chalito.local', '30111222', 1, 'POR_HORA', 5200.00, 0.00, '2024-01-15', 'Perfil testing: ritmo alto en turnos de mediodia'),
    ('Bruno', 'Mendez', '11-4022-1933', 'bruno.mendez.testing@chalito.local', '28999331', 1, 'POR_HORA', 5700.00, 0.00, '2023-11-20', 'Perfil testing: colaborador estable'),
    ('Carla', 'Paz', '11-5891-4420', 'carla.paz.testing@chalito.local', '31555777', 1, 'POR_HORA', 6100.00, 0.00, '2024-03-04', 'Perfil testing: soporte de caja y cierres'),
    ('Diego', 'Romero', '11-4770-8802', 'diego.romero.testing@chalito.local', '27666555', 1, 'POR_HORA', 6800.00, 0.00, '2022-09-12', 'Perfil testing: encargado de turno')
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    apellido = VALUES(apellido),
    telefono = VALUES(telefono),
    activo = VALUES(activo),
    tipo_pago = VALUES(tipo_pago),
    valor_hora = VALUES(valor_hora),
    observaciones = VALUES(observaciones);

-- Resolver IDs reales para usar en tablas hijas.
SET @emp_ana := (SELECT id FROM empleados WHERE email = 'ana.suarez.testing@chalito.local' LIMIT 1);
SET @emp_bruno := (SELECT id FROM empleados WHERE email = 'bruno.mendez.testing@chalito.local' LIMIT 1);
SET @emp_carla := (SELECT id FROM empleados WHERE email = 'carla.paz.testing@chalito.local' LIMIT 1);
SET @emp_diego := (SELECT id FROM empleados WHERE email = 'diego.romero.testing@chalito.local' LIMIT 1);

-- =========================================================
-- 2) ASISTENCIAS
-- Genera asistencias distribuidas durante 1 anio (2025) para los 4 empleados.
-- Reglas:
-- - Jornadas de 4, 5, 6, 7 y 8 horas.
-- - Algunos dias sin asistencia (se toman solo ciertos dias del mes).
-- - Algunos registros en estado CORREGIDO.
-- - Sin asistencias abiertas; todas con ingreso y egreso.
-- - Evita duplicados al re-ejecutar (chequeo por empleado + fecha + ingreso).
-- =========================================================
INSERT INTO empleados_asistencias (
    empleado_id, fecha, hora_ingreso, hora_egreso, minutos_trabajados,
    estado, registrado_por_usuario_id, corregido_por_usuario_id,
    observaciones, motivo_correccion
)
WITH RECURSIVE calendario AS (
    SELECT DATE('2025-01-01') AS fecha
    UNION ALL
    SELECT DATE_ADD(fecha, INTERVAL 1 DAY)
    FROM calendario
    WHERE fecha < DATE('2025-12-31')
),
empleados_seed AS (
    SELECT @emp_ana AS empleado_id, 1 AS emp_seq
    UNION ALL
    SELECT @emp_bruno, 2
    UNION ALL
    SELECT @emp_carla, 3
    UNION ALL
    SELECT @emp_diego, 4
),
asistencias_base AS (
    SELECT
        e.empleado_id,
        e.emp_seq,
        c.fecha,
        TIMESTAMP(
            c.fecha,
            CASE ((WEEKDAY(c.fecha) + e.emp_seq) % 4)
                WHEN 0 THEN '08:00:00'
                WHEN 1 THEN '08:30:00'
                WHEN 2 THEN '09:00:00'
                ELSE '09:30:00'
            END
        ) AS hora_ingreso,
        CASE ((DAYOFMONTH(c.fecha) + e.emp_seq) % 5)
            WHEN 0 THEN 240
            WHEN 1 THEN 300
            WHEN 2 THEN 360
            WHEN 3 THEN 420
            ELSE 480
        END AS minutos_trabajados,
        CASE
            WHEN DAYOFMONTH(c.fecha) IN (10, 22) AND e.emp_seq IN (2, 4) THEN 'CORREGIDO'
            WHEN DAYOFMONTH(c.fecha) IN (6, 18) AND e.emp_seq = 3 THEN 'CORREGIDO'
            ELSE 'CERRADO'
        END AS estado
    FROM calendario c
    INNER JOIN empleados_seed e ON 1 = 1
    WHERE DAYOFMONTH(c.fecha) IN (2, 6, 10, 14, 18, 22, 26)
      AND WEEKDAY(c.fecha) BETWEEN 0 AND 4
)
SELECT
    b.empleado_id,
    b.fecha,
    b.hora_ingreso,
    TIMESTAMPADD(MINUTE, b.minutos_trabajados, b.hora_ingreso) AS hora_egreso,
    b.minutos_trabajados,
    b.estado,
    @usuario_encargado AS registrado_por_usuario_id,
    CASE WHEN b.estado = 'CORREGIDO' THEN @usuario_rrhh ELSE NULL END AS corregido_por_usuario_id,
    CASE
        WHEN b.estado = 'CORREGIDO' THEN 'Registro corregido por ajuste de horario'
        ELSE 'Jornada normal de operacion'
    END AS observaciones,
    CASE
        WHEN b.estado = 'CORREGIDO' THEN 'Correccion administrativa por diferencia de marcacion'
        ELSE NULL
    END AS motivo_correccion
FROM asistencias_base b
LEFT JOIN empleados_asistencias ex
    ON ex.empleado_id = b.empleado_id
   AND ex.fecha = b.fecha
   AND ex.hora_ingreso = b.hora_ingreso
WHERE ex.id IS NULL;

-- =========================================================
-- 3) MOVIMIENTOS
-- Inserta movimientos variados (BONO, DESCUENTO, ADELANTO, CONSUMO)
-- distribuidos en distintos meses para los 4 empleados.
-- Incluye montos y descripciones realistas.
-- Evita duplicados al re-ejecutar.
-- =========================================================
INSERT INTO empleados_movimientos (
    empleado_id, fecha, tipo, monto, descripcion, observaciones, registrado_por_usuario_id
)
SELECT
    m.empleado_id,
    m.fecha,
    m.tipo,
    m.monto,
    m.descripcion,
    m.observaciones,
    m.registrado_por_usuario_id
FROM (
    -- Ana Suarez
    SELECT @emp_ana AS empleado_id, DATE('2025-01-15') AS fecha, 'BONO' AS tipo, 18000.00 AS monto, 'Bono productividad enero' AS descripcion, 'Cumplio objetivos del mes' AS observaciones, @usuario_rrhh AS registrado_por_usuario_id
    UNION ALL SELECT @emp_ana, DATE('2025-02-12'), 'CONSUMO', 6200.00, 'Consumo comedor interno', 'Descuento de viandas', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-03-18'), 'ADELANTO', 25000.00, 'Adelanto quincena marzo', 'Solicitado por la empleada', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-05-09'), 'DESCUENTO', 4000.00, 'Descuento uniforme', 'Reposicion de indumentaria', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-07-22'), 'BONO', 22000.00, 'Bono temporada alta', 'Buen desempeno en vacaciones de invierno', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-08-14'), 'CONSUMO', 7800.00, 'Consumo productos internos', 'Compras en barra personal', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-09-19'), 'ADELANTO', 30000.00, 'Adelanto extraordinario septiembre', 'Necesidad puntual', @usuario_rrhh
    UNION ALL SELECT @emp_ana, DATE('2025-11-11'), 'DESCUENTO', 5500.00, 'Descuento tardanzas acumuladas', 'Aplicado segun politica interna', @usuario_rrhh

    -- Bruno Mendez
    UNION ALL SELECT @emp_bruno, DATE('2025-01-10'), 'BONO', 15000.00, 'Bono por asistencia perfecta', 'Mes sin ausencias', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-02-21'), 'CONSUMO', 5400.00, 'Consumo cafeteria', 'Uso interno durante turnos', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-04-03'), 'ADELANTO', 20000.00, 'Adelanto abril', 'Solicitud aprobada por encargado', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-05-28'), 'DESCUENTO', 3800.00, 'Descuento faltante menor', 'Ajuste de caja acordado', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-07-05'), 'BONO', 21000.00, 'Bono rendimiento invierno', 'Mejora en tiempos de despacho', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-08-23'), 'CONSUMO', 6900.00, 'Consumo menu personal', 'Consumo interno mensual', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-10-15'), 'ADELANTO', 28000.00, 'Adelanto octubre', 'Compensacion a cuenta de sueldo', @usuario_rrhh
    UNION ALL SELECT @emp_bruno, DATE('2025-12-02'), 'DESCUENTO', 4200.00, 'Descuento uniforme adicional', 'Reposicion por desgaste', @usuario_rrhh

    -- Carla Paz
    UNION ALL SELECT @emp_carla, DATE('2025-01-18'), 'BONO', 19500.00, 'Bono cierre de caja', 'Sin diferencias en cierre mensual', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-03-01'), 'CONSUMO', 7300.00, 'Consumo productos de tienda', 'Compras internas de mostrador', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-03-26'), 'ADELANTO', 24000.00, 'Adelanto marzo', 'Adelanto pactado', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-06-07'), 'DESCUENTO', 4600.00, 'Descuento por retrasos', 'Tres llegadas tarde en el mes', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-07-29'), 'BONO', 23000.00, 'Bono por capacitacion', 'Capacitacion completada', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-09-12'), 'CONSUMO', 8100.00, 'Consumo interno septiembre', 'Incluye viandas y bebidas', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-10-21'), 'ADELANTO', 32000.00, 'Adelanto octubre', 'Aprobado por gerencia', @usuario_rrhh
    UNION ALL SELECT @emp_carla, DATE('2025-11-27'), 'DESCUENTO', 3500.00, 'Descuento por rotura menor', 'Descuento parcial acordado', @usuario_rrhh

    -- Diego Romero
    UNION ALL SELECT @emp_diego, DATE('2025-01-08'), 'BONO', 26000.00, 'Bono liderazgo operativo', 'Coordinacion eficiente de equipo', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-02-17'), 'CONSUMO', 8800.00, 'Consumo encargado', 'Consumo interno mensual', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-04-11'), 'ADELANTO', 35000.00, 'Adelanto abril encargado', 'Adelanto excepcional', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-05-20'), 'DESCUENTO', 6000.00, 'Descuento por uso de insumos', 'Ajuste administrativo', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-07-17'), 'BONO', 29000.00, 'Bono alto desempeno', 'Metas superadas en temporada alta', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-08-30'), 'CONSUMO', 9400.00, 'Consumo interno agosto', 'Consumo de carta personal', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-10-09'), 'ADELANTO', 38000.00, 'Adelanto octubre encargado', 'Solicitud autorizada', @usuario_rrhh
    UNION ALL SELECT @emp_diego, DATE('2025-12-12'), 'DESCUENTO', 5200.00, 'Descuento ajuste inventario', 'Ajuste final de anio', @usuario_rrhh
) m
LEFT JOIN empleados_movimientos ex
    ON ex.empleado_id = m.empleado_id
   AND ex.fecha = m.fecha
   AND ex.tipo = m.tipo
   AND ex.monto = m.monto
   AND ex.descripcion = m.descripcion
WHERE ex.id IS NULL;

-- =========================================================
-- 4) LIQUIDACIONES
-- Inserta liquidaciones de ejemplo (mensuales y por rango) para testing.
-- Los totales se calculan en base a asistencias/movimientos existentes.
-- Evita duplicados por empleado + rango de fechas.
-- =========================================================
INSERT INTO empleados_liquidaciones (
    empleado_id,
    fecha_desde,
    fecha_hasta,
    total_asistencias,
    total_minutos,
    total_base,
    total_bonos,
    total_descuentos,
    total_adelantos,
    total_consumos,
    total_final,
    estado,
    observaciones,
    generado_por_usuario_id
)
WITH periodos AS (
    -- Ana
    SELECT 101 AS periodo_id, @emp_ana AS empleado_id, DATE('2025-01-01') AS fecha_desde, DATE('2025-01-31') AS fecha_hasta, 'CERRADA' AS estado, 'Liquidacion mensual enero 2025' AS observaciones
    UNION ALL SELECT 102, @emp_ana, DATE('2025-06-01'), DATE('2025-06-30'), 'CERRADA', 'Liquidacion mensual junio 2025'
    UNION ALL SELECT 103, @emp_ana, DATE('2025-09-01'), DATE('2025-10-31'), 'PAGADA', 'Liquidacion por rango septiembre-octubre 2025'
    UNION ALL SELECT 104, @emp_ana, DATE('2025-12-01'), DATE('2025-12-31'), 'CERRADA', 'Liquidacion mensual diciembre 2025'

    -- Bruno
    UNION ALL SELECT 201, @emp_bruno, DATE('2025-01-01'), DATE('2025-01-31'), 'CERRADA', 'Liquidacion mensual enero 2025'
    UNION ALL SELECT 202, @emp_bruno, DATE('2025-05-01'), DATE('2025-05-31'), 'CERRADA', 'Liquidacion mensual mayo 2025'
    UNION ALL SELECT 203, @emp_bruno, DATE('2025-07-01'), DATE('2025-08-31'), 'PAGADA', 'Liquidacion por rango julio-agosto 2025'
    UNION ALL SELECT 204, @emp_bruno, DATE('2025-12-01'), DATE('2025-12-31'), 'CERRADA', 'Liquidacion mensual diciembre 2025'

    -- Carla
    UNION ALL SELECT 301, @emp_carla, DATE('2025-02-01'), DATE('2025-02-28'), 'CERRADA', 'Liquidacion mensual febrero 2025'
    UNION ALL SELECT 302, @emp_carla, DATE('2025-06-01'), DATE('2025-06-30'), 'CERRADA', 'Liquidacion mensual junio 2025'
    UNION ALL SELECT 303, @emp_carla, DATE('2025-10-01'), DATE('2025-11-30'), 'PAGADA', 'Liquidacion por rango octubre-noviembre 2025'
    UNION ALL SELECT 304, @emp_carla, DATE('2025-12-01'), DATE('2025-12-31'), 'CERRADA', 'Liquidacion mensual diciembre 2025'

    -- Diego
    UNION ALL SELECT 401, @emp_diego, DATE('2025-03-01'), DATE('2025-03-31'), 'CERRADA', 'Liquidacion mensual marzo 2025'
    UNION ALL SELECT 402, @emp_diego, DATE('2025-07-01'), DATE('2025-07-31'), 'CERRADA', 'Liquidacion mensual julio 2025'
    UNION ALL SELECT 403, @emp_diego, DATE('2025-09-01'), DATE('2025-10-31'), 'PAGADA', 'Liquidacion por rango septiembre-octubre 2025'
    UNION ALL SELECT 404, @emp_diego, DATE('2025-12-01'), DATE('2025-12-31'), 'CERRADA', 'Liquidacion mensual diciembre 2025'
),
resumen_asistencias AS (
    SELECT
        p.periodo_id,
        COUNT(a.id) AS total_asistencias,
        COALESCE(SUM(a.minutos_trabajados), 0) AS total_minutos
    FROM periodos p
    LEFT JOIN empleados_asistencias a
        ON a.empleado_id = p.empleado_id
       AND a.fecha BETWEEN p.fecha_desde AND p.fecha_hasta
       AND a.estado IN ('CERRADO', 'CORREGIDO')
    GROUP BY p.periodo_id
),
resumen_movimientos AS (
    SELECT
        p.periodo_id,
        COALESCE(SUM(CASE WHEN m.tipo = 'BONO' THEN m.monto ELSE 0 END), 0) AS total_bonos,
        COALESCE(SUM(CASE WHEN m.tipo = 'DESCUENTO' THEN m.monto ELSE 0 END), 0) AS total_descuentos,
        COALESCE(SUM(CASE WHEN m.tipo = 'ADELANTO' THEN m.monto ELSE 0 END), 0) AS total_adelantos,
        COALESCE(SUM(CASE WHEN m.tipo = 'CONSUMO' THEN m.monto ELSE 0 END), 0) AS total_consumos
    FROM periodos p
    LEFT JOIN empleados_movimientos m
        ON m.empleado_id = p.empleado_id
       AND m.fecha BETWEEN p.fecha_desde AND p.fecha_hasta
    GROUP BY p.periodo_id
)
SELECT
    p.empleado_id,
    p.fecha_desde,
    p.fecha_hasta,
    ra.total_asistencias,
    ra.total_minutos,
    ROUND((ra.total_minutos / 60) * e.valor_hora, 2) AS total_base,
    ROUND(rm.total_bonos, 2) AS total_bonos,
    ROUND(rm.total_descuentos, 2) AS total_descuentos,
    ROUND(rm.total_adelantos, 2) AS total_adelantos,
    ROUND(rm.total_consumos, 2) AS total_consumos,
    ROUND(
        ((ra.total_minutos / 60) * e.valor_hora)
        + rm.total_bonos
        - rm.total_descuentos
        - rm.total_adelantos
        - rm.total_consumos,
        2
    ) AS total_final,
    p.estado,
    p.observaciones,
    @usuario_rrhh AS generado_por_usuario_id
FROM periodos p
INNER JOIN empleados e
    ON e.id = p.empleado_id
INNER JOIN resumen_asistencias ra
    ON ra.periodo_id = p.periodo_id
INNER JOIN resumen_movimientos rm
    ON rm.periodo_id = p.periodo_id
LEFT JOIN empleados_liquidaciones ex
    ON ex.empleado_id = p.empleado_id
   AND ex.fecha_desde = p.fecha_desde
   AND ex.fecha_hasta = p.fecha_hasta
WHERE ex.id IS NULL;

COMMIT;

-- =========================================================
-- FIN DEL SEED
-- Archivo listo para ejecutar manualmente en MySQL Workbench o CLI.
-- =========================================================