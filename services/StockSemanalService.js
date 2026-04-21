const db = require('../controllers/dbPromise');

const throwHttp = (status, message, code, details = undefined) => {
    const err = new Error(message);
    err.status = status;
    if (code) err.code = code;
    if (details !== undefined) err.details = details;
    throw err;
};

const toUsuarioDbId = (raw) => {
    if (raw === undefined || raw === null || raw === '') {
        throwHttp(401, 'Usuario no identificado', 'NO_USUARIO');
    }
    const n = Number(raw);
    if (
        !Number.isFinite(n) ||
        n <= 0 ||
        !Number.isInteger(n) ||
        n > Number.MAX_SAFE_INTEGER
    ) {
        throwHttp(400, 'Identificador de usuario invalido', 'USUARIO_INVALIDO');
    }
    return n;
};

const mapRow = (row) => {
    if (!row) return row;
    const out = { ...row };
    if (out.activo !== undefined) out.activo = Boolean(Number(out.activo));
    return out;
};

const clampInt = (n, min, max) => Math.min(max, Math.max(min, n));

const parseIntOrFallback = (raw, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed)) return fallback;
    const truncated = Math.trunc(parsed);
    if (truncated < min || truncated > max) return fallback;
    return truncated;
};

const normalizeEstadoSemana = (rawEstado) => {
    if (rawEstado === undefined || rawEstado === null) return undefined;
    const normalized = String(rawEstado).trim().toUpperCase();
    if (!normalized) return undefined;
    if (normalized === 'ABIERTA' || normalized === 'CERRADA') return normalized;
    return undefined;
};

const parseHistoricoPaginacion = (query = {}) => {
    const {
        limite: limiteIn,
        limit,
        pagina: paginaIn,
        page,
        offset: offsetIn,
        estado
    } = query;

    const rawLimite = limiteIn ?? limit;
    const rawPagina = paginaIn ?? page;

    const limite = clampInt(parseIntOrFallback(rawLimite, 20, { min: 1, max: 100 }), 1, 100);
    const pagina = parseIntOrFallback(rawPagina, 1, { min: 1 });

    let offset;
    const offsetDefined =
        offsetIn !== undefined && offsetIn !== null && String(offsetIn).trim() !== '';
    if (offsetDefined) {
        offset = clampInt(parseIntOrFallback(offsetIn, 0, { min: 0, max: 10_000_000 }), 0, 10_000_000);
    } else {
        offset = (pagina - 1) * limite;
        if (!Number.isFinite(offset) || offset < 0) {
            offset = 0;
        }
        offset = Math.trunc(offset);
    }

    return {
        limite,
        pagina,
        offset,
        estado: normalizeEstadoSemana(estado),
        offsetExplicito: offsetDefined
    };
};

const listarInsumosSemanales = async ({ incluirInactivos = false } = {}) => {
    let sql = `
        SELECT id, nombre, descripcion, activo, fecha_creacion, fecha_actualizacion
        FROM insumos_semanales
    `;
    const params = [];
    if (!incluirInactivos) {
        sql += ' WHERE activo = 1';
    }
    sql += ' ORDER BY nombre ASC';
    const [rows] = await db.execute(sql, params);
    return rows.map(mapRow);
};

const obtenerInsumoPorId = async (id) => {
    const [rows] = await db.execute(
        `
        SELECT id, nombre, descripcion, activo, fecha_creacion, fecha_actualizacion
        FROM insumos_semanales
        WHERE id = ?
        `,
        [id]
    );
    return rows.length ? mapRow(rows[0]) : null;
};

const crearInsumoSemanal = async ({ nombre, descripcion = null, activo = true }) => {
    const [result] = await db.execute(
        `
        INSERT INTO insumos_semanales (nombre, descripcion, activo)
        VALUES (?, ?, ?)
        `,
        [nombre, descripcion, activo ? 1 : 0]
    );
    return obtenerInsumoPorId(result.insertId);
};

const editarInsumoSemanal = async (id, { nombre, descripcion }) => {
    const existente = await obtenerInsumoPorId(id);
    if (!existente) return null;

    const updates = [];
    const params = [];
    if (nombre !== undefined) {
        updates.push('nombre = ?');
        params.push(nombre);
    }
    if (descripcion !== undefined) {
        updates.push('descripcion = ?');
        params.push(descripcion);
    }
    if (!updates.length) {
        return existente;
    }
    params.push(id);
    await db.execute(`UPDATE insumos_semanales SET ${updates.join(', ')} WHERE id = ?`, params);
    return obtenerInsumoPorId(id);
};

const setActivoInsumoSemanal = async (id, activo) => {
    const existente = await obtenerInsumoPorId(id);
    if (!existente) return null;
    await db.execute('UPDATE insumos_semanales SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
    return obtenerInsumoPorId(id);
};

const eliminarInsumoSemanal = async (id) => {
    const existente = await obtenerInsumoPorId(id);
    if (!existente) return null;

    const [usoRows] = await db.execute(
        `
        SELECT COUNT(*) AS total
        FROM semanas_stock_detalle
        WHERE insumo_semanal_id = ?
        `,
        [id]
    );
    const totalUso = Number(usoRows?.[0]?.total || 0);
    if (totalUso > 0) {
        throwHttp(
            409,
            'No se puede eliminar el insumo porque tiene historial de semanas asociado. Desactívelo en su lugar.',
            'INSUMO_CON_HISTORIAL'
        );
    }

    await db.execute('DELETE FROM insumos_semanales WHERE id = ?', [id]);
    return existente;
};

const obtenerSemanaAbierta = async () => {
    const [rows] = await db.execute(
        `
        SELECT
            id,
            fecha_inicio,
            fecha_fin,
            estado,
            observaciones,
            creada_por_usuario_id,
            cerrada_por_usuario_id,
            fecha_cierre,
            fecha_creacion,
            fecha_actualizacion
        FROM semanas_stock
        WHERE estado = 'ABIERTA'
        ORDER BY id DESC
        LIMIT 1
        `
    );
    return rows.length ? rows[0] : null;
};

const crearSemanaStock = async ({ fecha_inicio, fecha_fin, observaciones = null }, creadaPorUsuarioId) => {
    const uid = toUsuarioDbId(creadaPorUsuarioId);
    let semanaId;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [abierta] = await conn.execute(
            `SELECT id FROM semanas_stock WHERE estado = 'ABIERTA' LIMIT 1 FOR UPDATE`,
            []
        );
        if (abierta.length) {
            throwHttp(
                409,
                'Ya existe una semana de stock abierta. Debe cerrarla antes de crear otra.',
                'SEMANA_ABIERTA_EXISTENTE'
            );
        }

        const [insRes] = await conn.execute(
            `
            INSERT INTO semanas_stock (fecha_inicio, fecha_fin, estado, observaciones, creada_por_usuario_id)
            VALUES (?, ?, 'ABIERTA', ?, ?)
            `,
            [fecha_inicio, fecha_fin, observaciones, uid]
        );
        semanaId = insRes.insertId;

        const [insumos] = await conn.execute(
            `
            SELECT id FROM insumos_semanales
            WHERE activo = 1
            ORDER BY id ASC
            `,
            []
        );

        if (!insumos.length) {
            throwHttp(
                400,
                'No hay insumos semanales activos. Active al menos uno antes de crear una semana.',
                'SIN_INSUMOS_ACTIVOS'
            );
        }

        for (const ins of insumos) {
            await conn.execute(
                `
                INSERT INTO semanas_stock_detalle (semana_stock_id, insumo_semanal_id, stock_inicial, stock_final)
                VALUES (?, ?, NULL, NULL)
                `,
                [semanaId, ins.id]
            );
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return obtenerSemanaConDetalle(semanaId);
};

const listarHistoricoSemanas = async (query = {}) => {
    const { limite, pagina, offset, estado, offsetExplicito } = parseHistoricoPaginacion(query);
    const where = [];
    const params = [];
    if (estado) {
        where.push('s.estado = ?');
        params.push(estado);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM semanas_stock s ${whereSql}`,
        params
    );
    const total = Number(countRows[0]?.total || 0);

    const limiteSql = Math.trunc(limite);
    const offsetSql = Math.trunc(offset);

    const [rows] = await db.execute(
        `
        SELECT
            s.id,
            s.fecha_inicio,
            s.fecha_fin,
            s.estado,
            s.observaciones,
            s.creada_por_usuario_id,
            s.cerrada_por_usuario_id,
            s.fecha_cierre,
            s.fecha_creacion,
            s.fecha_actualizacion,
            (SELECT COUNT(*) FROM semanas_stock_detalle d WHERE d.semana_stock_id = s.id) AS cantidad_insumos
        FROM semanas_stock s
        ${whereSql}
        ORDER BY s.fecha_inicio DESC, s.id DESC
        LIMIT ${limiteSql} OFFSET ${offsetSql}
        `,
        params
    );

    const paginaRespuesta = offsetExplicito ? Math.floor(offsetSql / limiteSql) + 1 : pagina;

    return {
        items: rows,
        paginacion: {
            total,
            limite: limiteSql,
            pagina: paginaRespuesta,
            total_paginas: limiteSql > 0 ? Math.ceil(total / limiteSql) : 0
        }
    };
};

const obtenerSemanaConDetalle = async (semanaId) => {
    const [semanas] = await db.execute(
        `
        SELECT
            id,
            fecha_inicio,
            fecha_fin,
            estado,
            observaciones,
            creada_por_usuario_id,
            cerrada_por_usuario_id,
            fecha_cierre,
            fecha_creacion,
            fecha_actualizacion
        FROM semanas_stock
        WHERE id = ?
        `,
        [semanaId]
    );
    if (!semanas.length) return null;

    const [detalle] = await db.execute(
        `
        SELECT
            d.id,
            d.semana_stock_id,
            d.insumo_semanal_id,
            d.stock_inicial,
            d.stock_final,
            d.consumo_calculado,
            d.observaciones,
            d.fecha_creacion,
            d.fecha_actualizacion,
            i.nombre AS insumo_nombre,
            i.activo AS insumo_activo
        FROM semanas_stock_detalle d
        INNER JOIN insumos_semanales i ON i.id = d.insumo_semanal_id
        WHERE d.semana_stock_id = ?
        ORDER BY i.nombre ASC
        `,
        [semanaId]
    );

    const semana = semanas[0];
    return {
        ...semana,
        detalle: detalle.map((r) => ({
            ...r,
            insumo_activo: Boolean(Number(r.insumo_activo))
        }))
    };
};

const obtenerDetallePorId = async (detalleId) => {
    const [rows] = await db.execute(
        `
        SELECT
            d.id,
            d.semana_stock_id,
            d.insumo_semanal_id,
            d.stock_inicial,
            d.stock_final,
            d.consumo_calculado,
            d.observaciones,
            s.estado AS semana_estado
        FROM semanas_stock_detalle d
        INNER JOIN semanas_stock s ON s.id = d.semana_stock_id
        WHERE d.id = ?
        `,
        [detalleId]
    );
    return rows.length ? rows[0] : null;
};

const obtenerDetalleRespuestaPorId = async (detalleId) => {
    const [rows] = await db.execute(
        `
        SELECT
            d.id,
            d.semana_stock_id,
            d.insumo_semanal_id,
            d.stock_inicial,
            d.stock_final,
            d.consumo_calculado,
            d.observaciones,
            d.fecha_creacion,
            d.fecha_actualizacion,
            i.nombre AS insumo_nombre
        FROM semanas_stock_detalle d
        INNER JOIN insumos_semanales i ON i.id = d.insumo_semanal_id
        WHERE d.id = ?
        `,
        [detalleId]
    );
    return rows.length ? rows[0] : null;
};

const asegurarSemanaAbiertaParaEdicion = (detalleRow) => {
    if (!detalleRow) {
        throwHttp(404, 'Detalle de semana no encontrado', 'DETALLE_NO_ENCONTRADO');
    }
    if (detalleRow.semana_estado !== 'ABIERTA') {
        throwHttp(400, 'Solo se puede editar stock de una semana abierta', 'SEMANA_NO_ABIERTA');
    }
};

const actualizarStockInicialDetalle = async (detalleId, stockInicial, observaciones) => {
    const det = await obtenerDetallePorId(detalleId);
    asegurarSemanaAbiertaParaEdicion(det);

    const updates = [];
    const params = [];

    if (stockInicial !== undefined) {
        updates.push('stock_inicial = ?');
        params.push(stockInicial);
    }
    if (observaciones !== undefined) {
        updates.push('observaciones = ?');
        params.push(observaciones);
    }

    if (!updates.length) {
        return obtenerDetalleRespuestaPorId(detalleId);
    }

    params.push(detalleId);
    await db.execute(`UPDATE semanas_stock_detalle SET ${updates.join(', ')} WHERE id = ?`, params);

    return obtenerDetalleRespuestaPorId(detalleId);
};

const actualizarStockFinalDetalle = async (detalleId, stockFinal, observaciones) => {
    const det = await obtenerDetallePorId(detalleId);
    asegurarSemanaAbiertaParaEdicion(det);

    const updates = [];
    const params = [];

    if (stockFinal !== undefined) {
        updates.push('stock_final = ?');
        params.push(stockFinal);
    }
    if (observaciones !== undefined) {
        updates.push('observaciones = ?');
        params.push(observaciones);
    }

    if (!updates.length) {
        return obtenerDetalleRespuestaPorId(detalleId);
    }

    params.push(detalleId);
    await db.execute(`UPDATE semanas_stock_detalle SET ${updates.join(', ')} WHERE id = ?`, params);

    return obtenerDetalleRespuestaPorId(detalleId);
};

/**
 * Cierra una semana en estado ABIERTA.
 * - Valida que exista y no este ya cerrada.
 * - Exige stock_inicial y stock_final en cada linea de detalle (cierre con datos completos).
 * - Consolida detalles (consumo_calculado es columna generada en BD: queda stock_inicial - stock_final).
 * - Pasa la semana a CERRADA con cerrada_por_usuario_id y fecha_cierre.
 */
const cerrarSemanaStock = async (semanaId, cerradaPorUsuarioId) => {
    const uid = toUsuarioDbId(cerradaPorUsuarioId);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [semRows] = await conn.execute(
            `SELECT id, estado FROM semanas_stock WHERE id = ? FOR UPDATE`,
            [semanaId]
        );

        if (!semRows.length) {
            throwHttp(404, 'Semana no encontrada', 'SEMANA_NO_ENCONTRADA');
        }

        const estadoActual = semRows[0].estado;
        if (estadoActual === 'CERRADA') {
            throwHttp(400, 'La semana ya esta cerrada', 'SEMANA_YA_CERRADA');
        }
        if (estadoActual !== 'ABIERTA') {
            throwHttp(400, 'La semana no esta en estado abierto', 'SEMANA_NO_ABIERTA');
        }

        const [incompletos] = await conn.execute(
            `
            SELECT d.id, i.nombre
            FROM semanas_stock_detalle d
            INNER JOIN insumos_semanales i ON i.id = d.insumo_semanal_id
            WHERE d.semana_stock_id = ?
              AND (d.stock_final IS NULL OR d.stock_inicial IS NULL)
            ORDER BY i.nombre ASC
            `,
            [semanaId]
        );

        if (incompletos.length) {
            const lista = incompletos.map((r) => ({ id: r.id, insumo: r.nombre }));
            const nombres = incompletos.map((r) => r.nombre).slice(0, 5).join(', ');
            const extra = incompletos.length > 5 ? ` (y ${incompletos.length - 5} mas)` : '';
            throwHttp(
                400,
                `No se puede cerrar la semana hasta cargar stock inicial y final en todos los insumos. Pendientes: ${nombres}${extra}`,
                'CIERRE_DETALLE_INCOMPLETO',
                { lineas_incompletas: lista }
            );
        }

        await conn.execute(
            `
            UPDATE semanas_stock_detalle
            SET stock_inicial = stock_inicial
            WHERE semana_stock_id = ?
            `,
            [semanaId]
        );

        const [upd] = await conn.execute(
            `
            UPDATE semanas_stock
            SET estado = 'CERRADA',
                cerrada_por_usuario_id = ?,
                fecha_cierre = NOW()
            WHERE id = ? AND estado = 'ABIERTA'
            `,
            [uid, semanaId]
        );

        if (!upd.affectedRows) {
            throwHttp(409, 'No se pudo cerrar la semana. Reintente o verifique el estado.', 'CIERRE_CONFLICTO');
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return obtenerSemanaConDetalle(semanaId);
};

module.exports = {
    listarInsumosSemanales,
    obtenerInsumoPorId,
    crearInsumoSemanal,
    editarInsumoSemanal,
    setActivoInsumoSemanal,
    eliminarInsumoSemanal,
    obtenerSemanaAbierta,
    crearSemanaStock,
    listarHistoricoSemanas,
    obtenerSemanaConDetalle,
    actualizarStockInicialDetalle,
    actualizarStockFinalDetalle,
    cerrarSemanaStock
};
