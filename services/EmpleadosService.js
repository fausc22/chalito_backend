const db = require('../controllers/dbPromise');

const EMPLEADOS_SELECT = `
    SELECT
        id, nombre, apellido, telefono, email, documento, activo,
        tipo_pago, valor_hora, fecha_ingreso, observaciones,
        fecha_creacion, fecha_actualizacion
    FROM empleados
`;

const MOVIMIENTOS_SELECT = `
    SELECT
        m.id,
        m.empleado_id,
        m.fecha,
        m.tipo,
        m.monto,
        m.descripcion,
        m.observaciones,
        m.registrado_por_usuario_id,
        m.created_at AS fecha_creacion,
        m.updated_at AS fecha_actualizacion,
        e.nombre AS empleado_nombre,
        e.apellido AS empleado_apellido,
        u.nombre AS registrado_por_nombre,
        CASE
            WHEN m.tipo = 'BONO' THEN 'SUMA'
            ELSE 'RESTA'
        END AS impacto,
        CASE
            WHEN m.tipo = 'BONO' THEN m.monto
            ELSE (m.monto * -1)
        END AS monto_impacto,
        EXISTS (
            SELECT 1
            FROM empleados_liquidaciones l
            WHERE l.empleado_id = m.empleado_id
              AND m.fecha BETWEEN l.fecha_desde AND l.fecha_hasta
              AND l.estado IN ('BORRADOR', 'CERRADA', 'PAGADA')
        ) AS esta_liquidado
    FROM empleados_movimientos m
    LEFT JOIN empleados e ON e.id = m.empleado_id
    LEFT JOIN usuarios u ON u.id = m.registrado_por_usuario_id
`;

/** Estados de liquidacion que vinculan movimientos al historial (no ANULADA). */
const ESTADOS_LIQUIDACION_BLOQUEAN_ELIMINAR_MOVIMIENTO = ['BORRADOR', 'CERRADA', 'PAGADA'];

const enriquecerMovimientoRespuesta = (row) => {
    if (!row) {
        return null;
    }
    const estaLiquidado = Boolean(Number(row.esta_liquidado));
    return {
        ...row,
        esta_liquidado: estaLiquidado,
        puede_eliminarse: !estaLiquidado
    };
};

/**
 * Indica si un movimiento (empleado + fecha) cae en el rango de alguna liquidacion
 * en estado BORRADOR, CERRADA o PAGADA.
 */
const movimientoCubiertoPorLiquidacionGuardada = async (connection, empleadoId, fecha) => {
    const placeholders = ESTADOS_LIQUIDACION_BLOQUEAN_ELIMINAR_MOVIMIENTO.map(() => '?').join(', ');
    const [rows] = await connection.execute(
        `
        SELECT l.id
        FROM empleados_liquidaciones l
        WHERE l.empleado_id = ?
          AND ? BETWEEN l.fecha_desde AND l.fecha_hasta
          AND l.estado IN (${placeholders})
        LIMIT 1
        `,
        [empleadoId, fecha, ...ESTADOS_LIQUIDACION_BLOQUEAN_ELIMINAR_MOVIMIENTO]
    );
    return rows.length > 0;
};

const obtenerEmpleados = async ({ activo }) => {
    let query = `${EMPLEADOS_SELECT} WHERE 1=1`;
    const params = [];

    if (activo !== undefined) {
        query += ' AND activo = ?';
        const activoNormalizado = typeof activo === 'boolean'
            ? activo
            : activo === 'true' || activo === '1';
        params.push(activoNormalizado ? 1 : 0);
    }

    query += ' ORDER BY apellido ASC, nombre ASC';
    const [rows] = await db.execute(query, params);
    return rows;
};

const obtenerEmpleadoPorId = async (id) => {
    const [rows] = await db.execute(`${EMPLEADOS_SELECT} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const crearEmpleado = async (data) => {
    const query = `
        INSERT INTO empleados (
            nombre, apellido, telefono, email, documento, activo, tipo_pago, valor_hora, fecha_ingreso, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, 'POR_HORA', ?, ?, ?)
    `;

    const values = [
        data.nombre,
        data.apellido,
        data.telefono || null,
        data.email || null,
        data.documento || null,
        data.activo ? 1 : 0,
        data.valor_hora,
        data.fecha_ingreso,
        data.observaciones || null
    ];

    const [result] = await db.execute(query, values);
    return obtenerEmpleadoPorId(result.insertId);
};

const actualizarEmpleado = async (id, data) => {
    const query = `
        UPDATE empleados
        SET
            nombre = COALESCE(?, nombre),
            apellido = COALESCE(?, apellido),
            telefono = ?,
            email = ?,
            documento = ?,
            tipo_pago = 'POR_HORA',
            valor_hora = ?,
            fecha_ingreso = COALESCE(?, fecha_ingreso),
            observaciones = ?,
            fecha_actualizacion = NOW()
        WHERE id = ?
    `;

    const values = [
        data.nombre ?? null,
        data.apellido ?? null,
        data.telefono ?? null,
        data.email ?? null,
        data.documento ?? null,
        data.valor_hora,
        data.fecha_ingreso ?? null,
        data.observaciones ?? null,
        id
    ];

    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
};

const actualizarActivoEmpleado = async (id, activo) => {
    const [result] = await db.execute(
        `UPDATE empleados
         SET activo = ?, fecha_actualizacion = NOW()
         WHERE id = ?`,
        [activo ? 1 : 0, id]
    );

    return result.affectedRows > 0;
};

const obtenerAsistencias = async ({ empleado_id, fecha_desde, fecha_hasta, estado }) => {
    let query = `
        SELECT
            a.id,
            a.empleado_id,
            a.fecha,
            a.hora_ingreso,
            a.hora_egreso,
            a.minutos_trabajados,
            a.estado,
            a.registrado_por_usuario_id,
            a.corregido_por_usuario_id,
            a.observaciones,
            a.motivo_correccion,
            a.created_at AS fecha_creacion,
            a.updated_at AS fecha_actualizacion,
            e.nombre AS empleado_nombre,
            e.apellido AS empleado_apellido,
            ur.nombre AS registrado_por_nombre,
            uc.nombre AS corregido_por_nombre
        FROM empleados_asistencias a
        LEFT JOIN empleados e ON e.id = a.empleado_id
        LEFT JOIN usuarios ur ON ur.id = a.registrado_por_usuario_id
        LEFT JOIN usuarios uc ON uc.id = a.corregido_por_usuario_id
        WHERE 1=1
    `;
    const params = [];

    if (empleado_id) {
        query += ' AND a.empleado_id = ?';
        params.push(parseInt(empleado_id, 10));
    }

    if (fecha_desde) {
        query += ' AND a.fecha >= ?';
        params.push(fecha_desde);
    }

    if (fecha_hasta) {
        query += ' AND a.fecha <= ?';
        params.push(fecha_hasta);
    }

    if (estado) {
        query += ' AND a.estado = ?';
        params.push(estado);
    }

    query += ' ORDER BY a.fecha DESC, a.id DESC';
    const [rows] = await db.execute(query, params);
    return rows;
};

const obtenerAsistenciaPorId = async (id) => {
    const [rows] = await db.execute(
        `
        SELECT
            a.id,
            a.empleado_id,
            a.fecha,
            a.hora_ingreso,
            a.hora_egreso,
            a.minutos_trabajados,
            a.estado,
            a.registrado_por_usuario_id,
            a.corregido_por_usuario_id,
            a.observaciones,
            a.motivo_correccion,
            a.created_at AS fecha_creacion,
            a.updated_at AS fecha_actualizacion,
            e.nombre AS empleado_nombre,
            e.apellido AS empleado_apellido,
            ur.nombre AS registrado_por_nombre,
            uc.nombre AS corregido_por_nombre
        FROM empleados_asistencias a
        LEFT JOIN empleados e ON e.id = a.empleado_id
        LEFT JOIN usuarios ur ON ur.id = a.registrado_por_usuario_id
        LEFT JOIN usuarios uc ON uc.id = a.corregido_por_usuario_id
        WHERE a.id = ?
        `,
        [id]
    );
    return rows[0] || null;
};

const buildBusinessError = (message, status, code) => {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
};

const obtenerUsuarioIdRequerido = (usuario) => {
    const usuarioId = Number(usuario?.id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        throw buildBusinessError(
            'No se pudo identificar el usuario autenticado para registrar la operacion',
            401,
            'USUARIO_AUTENTICADO_INVALIDO'
        );
    }
    return usuarioId;
};

const obtenerEmpleadoActivo = async (connection, empleadoId, messageIfInactive) => {
    const [empleados] = await connection.execute(
        `SELECT id, activo
         FROM empleados
         WHERE id = ?
         LIMIT 1`,
        [empleadoId]
    );

    if (empleados.length === 0) {
        throw buildBusinessError('Empleado no encontrado', 404, 'EMPLEADO_NO_ENCONTRADO');
    }

    if (!empleados[0].activo) {
        throw buildBusinessError(messageIfInactive, 409, 'EMPLEADO_INACTIVO');
    }
};

const obtenerAsistenciaAbierta = async (connection, empleadoId) => {
    const [rows] = await connection.execute(
        `SELECT id, empleado_id, fecha, hora_ingreso, hora_egreso, estado
         FROM empleados_asistencias
         WHERE empleado_id = ? AND estado = 'ABIERTO' AND hora_egreso IS NULL
         ORDER BY hora_ingreso DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [empleadoId]
    );
    return rows[0] || null;
};

const calcularMinutosTrabajados = (horaIngreso, horaEgreso) => {
    const inicio = new Date(horaIngreso);
    const fin = new Date(horaEgreso);
    const diffMs = fin.getTime() - inicio.getTime();

    if (!Number.isFinite(diffMs) || diffMs < 0) {
        return null;
    }

    return Math.floor(diffMs / 60000);
};

const obtenerFechaLocalActual = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const registrarIngresoAsistencia = async ({ empleado_id }, usuario = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const usuarioId = obtenerUsuarioIdRequerido(usuario);
        await obtenerEmpleadoActivo(connection, empleado_id, 'El empleado se encuentra inactivo');

        const abierta = await obtenerAsistenciaAbierta(connection, empleado_id);
        if (abierta) {
            throw buildBusinessError(
                'El empleado ya tiene una asistencia abierta',
                409,
                'ASISTENCIA_ABIERTA_EXISTENTE'
            );
        }

        const ahora = new Date();
        const fechaLocal = obtenerFechaLocalActual(ahora);

        const [result] = await connection.execute(
            `INSERT INTO empleados_asistencias (
                empleado_id, fecha, hora_ingreso, hora_egreso, minutos_trabajados,
                estado, registrado_por_usuario_id, observaciones, motivo_correccion
            ) VALUES (?, ?, ?, NULL, 0, 'ABIERTO', ?, NULL, NULL)`,
            [empleado_id, fechaLocal, ahora, usuarioId]
        );

        await connection.commit();
        return await obtenerAsistenciaPorId(result.insertId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const registrarEgresoAsistencia = async ({ empleado_id }) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const asistenciaAbierta = await obtenerAsistenciaAbierta(connection, empleado_id);
        if (!asistenciaAbierta) {
            throw buildBusinessError(
                'No hay una asistencia abierta para registrar egreso',
                409,
                'ASISTENCIA_ABIERTA_INEXISTENTE'
            );
        }

        const horaEgreso = new Date();
        const minutosTrabajados = calcularMinutosTrabajados(asistenciaAbierta.hora_ingreso, horaEgreso);
        if (minutosTrabajados === null) {
            throw buildBusinessError(
                'No se pudo calcular minutos trabajados para el egreso',
                400,
                'RANGO_HORARIO_INVALIDO'
            );
        }

        await connection.execute(
            `UPDATE empleados_asistencias
             SET hora_egreso = ?, minutos_trabajados = ?, estado = 'CERRADO', updated_at = NOW()
             WHERE id = ?`,
            [horaEgreso, minutosTrabajados, asistenciaAbierta.id]
        );

        await connection.commit();
        return await obtenerAsistenciaPorId(asistenciaAbierta.id);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const corregirAsistencia = async (id, data, usuario = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const usuarioId = obtenerUsuarioIdRequerido(usuario);

        const [rows] = await connection.execute(
            `SELECT id, hora_ingreso, hora_egreso
             FROM empleados_asistencias
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [id]
        );

        if (rows.length === 0) {
            throw buildBusinessError('Asistencia no encontrada', 404, 'ASISTENCIA_NO_ENCONTRADA');
        }

        const asistencia = rows[0];
        const horaIngresoFinal = data.hora_ingreso ?? asistencia.hora_ingreso;
        const horaEgresoFinal = data.hora_egreso ?? asistencia.hora_egreso;

        if (!horaIngresoFinal || !horaEgresoFinal) {
            throw buildBusinessError(
                'Para corregir asistencia se requieren hora_ingreso y hora_egreso',
                400,
                'HORAS_INCOMPLETAS'
            );
        }

        const minutosTrabajados = calcularMinutosTrabajados(horaIngresoFinal, horaEgresoFinal);
        if (minutosTrabajados === null) {
            throw buildBusinessError(
                'hora_egreso debe ser mayor a hora_ingreso',
                400,
                'RANGO_HORARIO_INVALIDO'
            );
        }

        await connection.execute(
            `UPDATE empleados_asistencias
             SET
                hora_ingreso = ?,
                hora_egreso = ?,
                minutos_trabajados = ?,
                estado = 'CORREGIDO',
                corregido_por_usuario_id = ?,
                observaciones = ?,
                motivo_correccion = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [
                horaIngresoFinal,
                horaEgresoFinal,
                minutosTrabajados,
                usuarioId,
                data.observaciones ?? null,
                data.motivo_correccion,
                id
            ]
        );

        await connection.commit();
        return await obtenerAsistenciaPorId(id);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const obtenerMovimientos = async ({ empleado_id, fecha_desde, fecha_hasta, tipo }) => {
    let query = `${MOVIMIENTOS_SELECT} WHERE 1=1`;
    const params = [];

    if (empleado_id) {
        query += ' AND m.empleado_id = ?';
        params.push(parseInt(empleado_id, 10));
    }

    if (fecha_desde) {
        query += ' AND m.fecha >= ?';
        params.push(fecha_desde);
    }

    if (fecha_hasta) {
        query += ' AND m.fecha <= ?';
        params.push(fecha_hasta);
    }

    if (tipo) {
        query += ' AND m.tipo = ?';
        params.push(tipo);
    }

    query += ' ORDER BY m.fecha DESC, m.id DESC';
    const [rows] = await db.execute(query, params);
    return rows.map((row) => enriquecerMovimientoRespuesta(row));
};

const obtenerMovimientoPorId = async (id) => {
    const [rows] = await db.execute(`${MOVIMIENTOS_SELECT} WHERE m.id = ?`, [id]);
    return enriquecerMovimientoRespuesta(rows[0] || null);
};

const normalizarMontoPositivo = (monto) => Math.abs(Number.parseFloat(monto));
const redondearMoneda = (valor) => Number((Number(valor) || 0).toFixed(2));
const redondearHoras = (valor) => Number((Number(valor) || 0).toFixed(2));
const calcularHorasDesdeMinutos = (minutos) => redondearHoras((Number(minutos) || 0) / 60);

/** Ejecuta SQL con la conexion de transaccion si se pasa, o con el pool global. */
const ejecutarSql = async (connection, sql, params = []) => {
    if (connection) {
        const [rows] = await connection.execute(sql, params);
        return rows;
    }
    const [rows] = await db.execute(sql, params);
    return rows;
};

const crearMovimiento = async (data, usuario = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        await obtenerEmpleadoActivo(connection, data.empleado_id, 'No se permiten movimientos para empleados inactivos');
        const usuarioId = obtenerUsuarioIdRequerido(usuario);
        const descripcionFinal = data.descripcion;

        const monto = normalizarMontoPositivo(data.monto);
        const [result] = await connection.execute(
            `INSERT INTO empleados_movimientos (
                empleado_id, fecha, tipo, monto, descripcion, observaciones, registrado_por_usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.empleado_id,
                data.fecha,
                data.tipo,
                monto,
                descripcionFinal,
                data.observaciones ?? null,
                usuarioId
            ]
        );

        await connection.commit();
        return await obtenerMovimientoPorId(result.insertId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const editarMovimiento = async (id, data, usuario = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT id, empleado_id, fecha, tipo, monto, descripcion, observaciones, registrado_por_usuario_id
             FROM empleados_movimientos
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [id]
        );

        if (rows.length === 0) {
            throw buildBusinessError('Movimiento no encontrado', 404, 'MOVIMIENTO_NO_ENCONTRADO');
        }

        const movimientoActual = rows[0];
        const empleadoIdFinal = data.empleado_id ?? movimientoActual.empleado_id;
        await obtenerEmpleadoActivo(connection, empleadoIdFinal, 'No se permiten movimientos para empleados inactivos');
        const usuarioId = obtenerUsuarioIdRequerido(usuario);

        const montoFinal = data.monto !== undefined
            ? normalizarMontoPositivo(data.monto)
            : normalizarMontoPositivo(movimientoActual.monto);
        const descripcionFinal = data.descripcion !== undefined ? data.descripcion : movimientoActual.descripcion;

        await connection.execute(
            `UPDATE empleados_movimientos
             SET
                empleado_id = ?,
                fecha = COALESCE(?, fecha),
                tipo = COALESCE(?, tipo),
                monto = ?,
                descripcion = ?,
                observaciones = ?,
                registrado_por_usuario_id = COALESCE(?, registrado_por_usuario_id),
                updated_at = NOW()
             WHERE id = ?`,
            [
                empleadoIdFinal,
                data.fecha ?? null,
                data.tipo ?? null,
                montoFinal,
                descripcionFinal,
                data.observaciones !== undefined ? data.observaciones : movimientoActual.observaciones,
                usuarioId,
                id
            ]
        );

        await connection.commit();
        return await obtenerMovimientoPorId(id);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const eliminarMovimiento = async (id) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT id, empleado_id, fecha, tipo, monto, descripcion, observaciones, registrado_por_usuario_id
             FROM empleados_movimientos
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [id]
        );

        if (rows.length === 0) {
            throw buildBusinessError('Movimiento no encontrado', 404, 'MOVIMIENTO_NO_ENCONTRADO');
        }

        const movimientoEliminado = rows[0];

        const cubierto = await movimientoCubiertoPorLiquidacionGuardada(
            connection,
            movimientoEliminado.empleado_id,
            movimientoEliminado.fecha
        );
        if (cubierto) {
            throw buildBusinessError(
                'No es posible eliminar este movimiento porque ya forma parte de una liquidacion guardada',
                409,
                'MOVIMIENTO_INCLUIDO_EN_LIQUIDACION'
            );
        }

        await connection.execute(`DELETE FROM empleados_movimientos WHERE id = ?`, [id]);

        await connection.commit();
        return movimientoEliminado;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const obtenerEmpleadoParaLiquidacion = async (empleadoId, connection = null) => {
    const rows = await ejecutarSql(
        connection,
        `SELECT id, nombre, apellido, activo, tipo_pago, valor_hora
         FROM empleados
         WHERE id = ?
         LIMIT 1`,
        [empleadoId]
    );

    if (rows.length === 0) {
        throw buildBusinessError('Empleado no encontrado', 404, 'EMPLEADO_NO_ENCONTRADO');
    }

    const empleado = rows[0];
    const valorHora = Number.parseFloat(empleado.valor_hora);
    if (!Number.isFinite(valorHora) || valorHora <= 0) {
        throw buildBusinessError(
            'El empleado no tiene un valor_hora valido para liquidar',
            409,
            'VALOR_HORA_INVALIDO'
        );
    }

    return {
        ...empleado,
        valor_hora: redondearMoneda(valorHora)
    };
};

const calcularResumenLiquidacion = async ({
    empleado_id,
    fecha_desde,
    fecha_hasta,
    incluir_detalle = false,
    connection = null
}) => {
    const empleado = await obtenerEmpleadoParaLiquidacion(empleado_id, connection);

    const asistenciaResumenRows = await ejecutarSql(
        connection,
        `
        SELECT
            COUNT(*) AS total_asistencias,
            COALESCE(SUM(minutos_trabajados), 0) AS total_minutos,
            MAX(fecha) AS ultima_asistencia_fecha
        FROM empleados_asistencias
        WHERE empleado_id = ?
          AND fecha >= ?
          AND fecha <= ?
          AND estado IN ('CERRADO', 'CORREGIDO')
        `,
        [empleado_id, fecha_desde, fecha_hasta]
    );

    const movimientosResumenRows = await ejecutarSql(
        connection,
        `
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'BONO' THEN monto ELSE 0 END), 0) AS total_bonos,
            COALESCE(SUM(CASE WHEN tipo = 'ADELANTO' THEN monto ELSE 0 END), 0) AS total_adelantos,
            COALESCE(SUM(CASE WHEN tipo = 'DESCUENTO' THEN monto ELSE 0 END), 0) AS total_descuentos,
            COALESCE(SUM(CASE WHEN tipo = 'CONSUMO' THEN monto ELSE 0 END), 0) AS total_consumos
        FROM empleados_movimientos
        WHERE empleado_id = ?
          AND fecha >= ?
          AND fecha <= ?
        `,
        [empleado_id, fecha_desde, fecha_hasta]
    );

    const asistenciaResumen = asistenciaResumenRows[0] || { total_asistencias: 0, total_minutos: 0 };
    const movimientosResumen = movimientosResumenRows[0] || {
        total_bonos: 0,
        total_adelantos: 0,
        total_descuentos: 0,
        total_consumos: 0
    };

    const totalAsistencias = Number(asistenciaResumen.total_asistencias) || 0;
    const totalMinutos = Number(asistenciaResumen.total_minutos) || 0;
    const totalHorasRaw = totalMinutos / 60;
    const totalBase = totalHorasRaw * empleado.valor_hora;
    const totalBonos = Number(movimientosResumen.total_bonos) || 0;
    const totalAdelantos = Number(movimientosResumen.total_adelantos) || 0;
    const totalDescuentos = Number(movimientosResumen.total_descuentos) || 0;
    const totalConsumos = Number(movimientosResumen.total_consumos) || 0;
    // Regla de negocio: bonos suman; adelantos, descuentos y consumos restan al total base.
    const totalFinal = totalBase + totalBonos - totalAdelantos - totalDescuentos - totalConsumos;

    const resumen = {
        empleado: {
            id: empleado.id,
            nombre: empleado.nombre,
            apellido: empleado.apellido,
            activo: Boolean(empleado.activo)
        },
        empleado_id: empleado.id,
        fecha_desde,
        fecha_hasta,
        valor_hora: redondearMoneda(empleado.valor_hora),
        total_asistencias: totalAsistencias,
        total_minutos: totalMinutos,
        ultima_asistencia_fecha: asistenciaResumen.ultima_asistencia_fecha || null,
        total_horas: calcularHorasDesdeMinutos(totalMinutos),
        total_base: redondearMoneda(totalBase),
        total_bonos: redondearMoneda(totalBonos),
        total_adelantos: redondearMoneda(totalAdelantos),
        total_descuentos: redondearMoneda(totalDescuentos),
        total_consumos: redondearMoneda(totalConsumos),
        total_final: redondearMoneda(totalFinal)
    };

    if (incluir_detalle) {
        const asistencias = await ejecutarSql(
            connection,
            `
            SELECT
                id,
                empleado_id,
                fecha,
                hora_ingreso,
                hora_egreso,
                minutos_trabajados,
                estado,
                registrado_por_usuario_id,
                corregido_por_usuario_id,
                observaciones,
                motivo_correccion,
                created_at AS fecha_creacion,
                updated_at AS fecha_actualizacion
            FROM empleados_asistencias
            WHERE empleado_id = ?
              AND fecha >= ?
              AND fecha <= ?
              AND estado IN ('CERRADO', 'CORREGIDO')
            ORDER BY fecha ASC, id ASC
            `,
            [empleado_id, fecha_desde, fecha_hasta]
        );

        const movimientos = await ejecutarSql(
            connection,
            `${MOVIMIENTOS_SELECT}
             WHERE m.empleado_id = ?
               AND m.fecha >= ?
               AND m.fecha <= ?
             ORDER BY m.fecha ASC, m.id ASC`,
            [empleado_id, fecha_desde, fecha_hasta]
        );

        resumen.detalle = {
            asistencias,
            movimientos: movimientos.map((row) => enriquecerMovimientoRespuesta(row))
        };
    }

    return resumen;
};

const obtenerLiquidaciones = async ({ empleado_id, fecha_desde, fecha_hasta, estado }) => {
    let query = `
        SELECT
            l.id,
            l.empleado_id,
            l.fecha_desde,
            l.fecha_hasta,
            l.total_asistencias,
            l.total_minutos,
            ROUND(l.total_minutos / 60, 2) AS total_horas,
            l.total_base,
            l.total_bonos,
            l.total_descuentos,
            l.total_adelantos,
            l.total_consumos,
            l.total_final,
            l.estado,
            l.observaciones,
            l.generado_por_usuario_id,
            l.created_at AS fecha_creacion,
            l.updated_at AS fecha_actualizacion,
            e.nombre,
            e.apellido
        FROM empleados_liquidaciones l
        INNER JOIN empleados e ON e.id = l.empleado_id
        WHERE 1=1
    `;
    const params = [];

    if (empleado_id) {
        query += ' AND l.empleado_id = ?';
        params.push(parseInt(empleado_id, 10));
    }

    if (fecha_desde) {
        query += ' AND l.fecha_desde >= ?';
        params.push(fecha_desde);
    }

    if (fecha_hasta) {
        query += ' AND l.fecha_hasta <= ?';
        params.push(fecha_hasta);
    }

    if (estado) {
        query += ' AND l.estado = ?';
        params.push(estado);
    }

    query += ' ORDER BY l.fecha_desde DESC, l.id DESC';
    const [rows] = await db.execute(query, params);
    return rows;
};

const obtenerLiquidacionPorId = async (id) => {
    const [rows] = await db.execute(
        `
        SELECT
            l.id,
            l.empleado_id,
            l.fecha_desde,
            l.fecha_hasta,
            l.total_asistencias,
            l.total_minutos,
            ROUND(l.total_minutos / 60, 2) AS total_horas,
            l.total_base,
            l.total_bonos,
            l.total_descuentos,
            l.total_adelantos,
            l.total_consumos,
            l.total_final,
            l.estado,
            l.observaciones,
            l.generado_por_usuario_id,
            l.created_at AS fecha_creacion,
            l.updated_at AS fecha_actualizacion,
            e.nombre,
            e.apellido,
            e.valor_hora,
            (
                SELECT MAX(a.fecha)
                FROM empleados_asistencias a
                WHERE a.empleado_id = l.empleado_id
                  AND a.fecha >= l.fecha_desde
                  AND a.fecha <= l.fecha_hasta
                  AND a.estado IN ('CERRADO', 'CORREGIDO')
            ) AS ultima_asistencia_fecha
        FROM empleados_liquidaciones l
        INNER JOIN empleados e ON e.id = l.empleado_id
        WHERE l.id = ?
        LIMIT 1
        `,
        [id]
    );
    return rows[0] || null;
};

const crearLiquidacion = async (data, usuario = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const usuarioId = obtenerUsuarioIdRequerido(usuario);

        const [duplicados] = await connection.execute(
            `SELECT id, estado
             FROM empleados_liquidaciones
             WHERE empleado_id = ?
               AND fecha_desde = ?
               AND fecha_hasta = ?
             LIMIT 1
             FOR UPDATE`,
            [data.empleado_id, data.fecha_desde, data.fecha_hasta]
        );

        if (duplicados.length > 0) {
            throw buildBusinessError(
                'Ya existe una liquidacion guardada para el empleado en ese rango',
                409,
                'LIQUIDACION_DUPLICADA'
            );
        }

        const resumen = await calcularResumenLiquidacion({
            empleado_id: data.empleado_id,
            fecha_desde: data.fecha_desde,
            fecha_hasta: data.fecha_hasta,
            incluir_detalle: false,
            connection
        });

        const montosKeys = ['total_base', 'total_bonos', 'total_descuentos', 'total_adelantos', 'total_consumos'];
        const montoEnPayload = (k) => data[k] !== undefined && data[k] !== null;
        const payloadMontosCompletos = montosKeys.every(montoEnPayload);
        const payloadAlgunMonto = montosKeys.some(montoEnPayload);

        if (payloadAlgunMonto && !payloadMontosCompletos) {
            throw buildBusinessError(
                'Si envia montos de liquidacion, debe enviar total_base, total_bonos, total_descuentos, total_adelantos y total_consumos',
                400,
                'TOTALES_LIQUIDACION_INCOMPLETOS'
            );
        }

        const totalBase = redondearMoneda(
            payloadMontosCompletos ? data.total_base : resumen.total_base
        );
        const totalBonos = redondearMoneda(
            payloadMontosCompletos ? data.total_bonos : resumen.total_bonos
        );
        const totalDescuentos = redondearMoneda(
            payloadMontosCompletos ? data.total_descuentos : resumen.total_descuentos
        );
        const totalAdelantos = redondearMoneda(
            payloadMontosCompletos ? data.total_adelantos : resumen.total_adelantos
        );
        const totalConsumos = redondearMoneda(
            payloadMontosCompletos ? data.total_consumos : resumen.total_consumos
        );
        const totalFinal = redondearMoneda(
            totalBase + totalBonos - totalAdelantos - totalDescuentos - totalConsumos
        );

        const [result] = await connection.execute(
            `
            INSERT INTO empleados_liquidaciones (
                empleado_id, fecha_desde, fecha_hasta, total_asistencias, total_minutos,
                total_base, total_bonos, total_descuentos, total_adelantos, total_consumos,
                total_final, estado, observaciones, generado_por_usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                resumen.empleado_id,
                resumen.fecha_desde,
                resumen.fecha_hasta,
                resumen.total_asistencias,
                resumen.total_minutos,
                totalBase,
                totalBonos,
                totalDescuentos,
                totalAdelantos,
                totalConsumos,
                totalFinal,
                'CERRADA',
                data.observaciones ?? null,
                usuarioId
            ]
        );

        await connection.commit();
        return await obtenerLiquidacionPorId(result.insertId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    obtenerEmpleados,
    obtenerEmpleadoPorId,
    crearEmpleado,
    actualizarEmpleado,
    actualizarActivoEmpleado,
    obtenerAsistencias,
    obtenerAsistenciaPorId,
    registrarIngresoAsistencia,
    registrarEgresoAsistencia,
    corregirAsistencia,
    obtenerMovimientos,
    obtenerMovimientoPorId,
    crearMovimiento,
    editarMovimiento,
    eliminarMovimiento,
    calcularResumenLiquidacion,
    obtenerLiquidaciones,
    obtenerLiquidacionPorId,
    crearLiquidacion
};
