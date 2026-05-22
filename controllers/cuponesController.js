const db = require('./dbPromise');
const couponService = require('../services/couponService');

function parseDecimal(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

function parseIntSafe(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) ? n : fallback;
}

const listarCupones = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, codigo, tipo, valor, monto_minimo, usos_maximos, usos_actuales,
                    fecha_inicio, fecha_fin, activo, created_at, updated_at
             FROM cupones
             ORDER BY activo DESC, codigo ASC`
        );
        res.json({ success: true, cupones: rows });
    } catch (error) {
        console.error('Error listando cupones:', error);
        res.status(500).json({ success: false, message: 'Error al listar cupones' });
    }
};

const crearCupon = async (req, res) => {
    try {
        const {
            codigo,
            tipo,
            valor,
            monto_minimo: montoMinimo = 0,
            usos_maximos: usosMaximos = 1,
            fecha_inicio: fechaInicio = null,
            fecha_fin: fechaFin = null,
            activo = 1
        } = req.body;

        const codigoNorm = couponService.normalizeCodigo(codigo);
        if (!codigoNorm) {
            return res.status(400).json({ success: false, message: 'Código de cupón requerido' });
        }

        if (!['porcentaje', 'monto_fijo'].includes(tipo)) {
            return res.status(400).json({ success: false, message: 'tipo debe ser porcentaje o monto_fijo' });
        }

        const valorNum = parseDecimal(valor);
        if (valorNum <= 0) {
            return res.status(400).json({ success: false, message: 'valor debe ser mayor a 0' });
        }
        if (tipo === 'porcentaje' && valorNum > 100) {
            return res.status(400).json({ success: false, message: 'El porcentaje no puede superar 100' });
        }

        const [result] = await db.execute(
            `INSERT INTO cupones (codigo, tipo, valor, monto_minimo, usos_maximos, fecha_inicio, fecha_fin, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigoNorm,
                tipo,
                valorNum,
                parseDecimal(montoMinimo, 0),
                Math.max(1, parseIntSafe(usosMaximos, 1)),
                fechaInicio || null,
                fechaFin || null,
                activo ? 1 : 0
            ]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Ya existe un cupón con ese código' });
        }
        console.error('Error creando cupón:', error);
        res.status(500).json({ success: false, message: 'Error al crear cupón' });
    }
};

const actualizarCupon = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'ID inválido' });
        }

        const [existing] = await db.execute(
            'SELECT id, usos_actuales FROM cupones WHERE id = ?',
            [id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Cupón no encontrado' });
        }

        const {
            codigo,
            tipo,
            valor,
            monto_minimo: montoMinimo,
            usos_maximos: usosMaximos,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            activo
        } = req.body;

        const usosActuales = parseIntSafe(existing[0].usos_actuales, 0);
        const usosMax = usosMaximos != null ? parseIntSafe(usosMaximos, 1) : null;

        if (usosMax != null && usosMax < usosActuales) {
            return res.status(400).json({
                success: false,
                message: `usos_maximos no puede ser menor que usos_actuales (${usosActuales})`
            });
        }

        const updates = [];
        const values = [];

        if (codigo != null) {
            const codigoNorm = couponService.normalizeCodigo(codigo);
            if (!codigoNorm) {
                return res.status(400).json({ success: false, message: 'Código inválido' });
            }
            updates.push('codigo = ?');
            values.push(codigoNorm);
        }
        if (tipo != null) {
            if (!['porcentaje', 'monto_fijo'].includes(tipo)) {
                return res.status(400).json({ success: false, message: 'tipo inválido' });
            }
            updates.push('tipo = ?');
            values.push(tipo);
        }
        if (valor != null) {
            const valorNum = parseDecimal(valor);
            if (valorNum <= 0) {
                return res.status(400).json({ success: false, message: 'valor inválido' });
            }
            updates.push('valor = ?');
            values.push(valorNum);
        }
        if (montoMinimo != null) {
            updates.push('monto_minimo = ?');
            values.push(parseDecimal(montoMinimo, 0));
        }
        if (usosMax != null) {
            updates.push('usos_maximos = ?');
            values.push(Math.max(1, usosMax));
        }
        if (fechaInicio !== undefined) {
            updates.push('fecha_inicio = ?');
            values.push(fechaInicio || null);
        }
        if (fechaFin !== undefined) {
            updates.push('fecha_fin = ?');
            values.push(fechaFin || null);
        }
        if (activo !== undefined) {
            updates.push('activo = ?');
            values.push(activo ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
        }

        values.push(id);
        await db.execute(`UPDATE cupones SET ${updates.join(', ')} WHERE id = ?`, values);

        res.json({ success: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Ya existe un cupón con ese código' });
        }
        console.error('Error actualizando cupón:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar cupón' });
    }
};

const toggleActivo = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [rows] = await db.execute('SELECT activo FROM cupones WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cupón no encontrado' });
        }
        const nuevoActivo = rows[0].activo ? 0 : 1;
        await db.execute('UPDATE cupones SET activo = ? WHERE id = ?', [nuevoActivo, id]);
        res.json({ success: true, activo: nuevoActivo === 1 });
    } catch (error) {
        console.error('Error toggle cupón:', error);
        res.status(500).json({ success: false, message: 'Error al cambiar estado del cupón' });
    }
};

module.exports = {
    listarCupones,
    crearCupon,
    actualizarCupon,
    toggleActivo
};
