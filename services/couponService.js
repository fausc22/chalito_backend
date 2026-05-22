/**
 * Validación y redención de cupones (tienda online, single-tenant).
 */
function getDb() {
    return require('../controllers/dbPromise');
}

function normalizeCodigo(codigo) {
    return String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calcularMontoDescuento(cuponRow, subtotalBruto) {
    const subtotal = Number(subtotalBruto) || 0;
    const valor = parseFloat(cuponRow.valor) || 0;

    if (cuponRow.tipo === 'porcentaje') {
        return round2(subtotal * Math.min(100, valor) / 100);
    }

    return round2(Math.min(valor, subtotal));
}

async function validateCoupon(codigo, subtotalBruto, connection = null) {
    const normalized = normalizeCodigo(codigo);
    if (!normalized) {
        return { valid: false, message: 'Código de cupón inválido' };
    }

    const executor = connection || getDb();
    const query = `
        SELECT id, codigo, tipo, valor, monto_minimo, usos_maximos, usos_actuales,
               fecha_inicio, fecha_fin, activo
        FROM cupones
        WHERE UPPER(TRIM(REPLACE(codigo, ' ', ''))) = ?
          AND activo = 1
        LIMIT 1
    `;

    const [rows] = await executor.execute(query, [normalized]);
    if (!rows || rows.length === 0) {
        return { valid: false, message: 'Cupón no encontrado o no válido' };
    }

    const c = rows[0];
    const now = new Date();

    if (c.fecha_inicio && new Date(c.fecha_inicio) > now) {
        return { valid: false, message: 'El cupón aún no está vigente' };
    }
    if (c.fecha_fin && new Date(c.fecha_fin) < now) {
        return { valid: false, message: 'El cupón ha expirado' };
    }

    const usosActuales = parseInt(c.usos_actuales, 10) || 0;
    const usosMaximos = parseInt(c.usos_maximos, 10) || 1;
    if (usosActuales >= usosMaximos) {
        return { valid: false, message: 'Este cupón ya no tiene usos disponibles' };
    }

    const montoMinimo = parseFloat(c.monto_minimo) || 0;
    const subtotal = Number(subtotalBruto) || 0;
    if (subtotal < montoMinimo) {
        return {
            valid: false,
            message: `El subtotal mínimo para este cupón es $${montoMinimo.toFixed(2)}`
        };
    }

    const montoDescuento = calcularMontoDescuento(c, subtotal);

    return {
        valid: true,
        cuponId: c.id,
        codigo: c.codigo,
        montoDescuento,
        tipo: c.tipo,
        valor: parseFloat(c.valor) || 0,
        message: 'Cupón válido'
    };
}

async function redeemCoupon(cuponId, pedidoId, montoAplicado, connection) {
    const monto = Number(montoAplicado) || 0;

    await connection.execute(
        `INSERT INTO cupones_redenciones (cupon_id, pedido_id, monto_aplicado) VALUES (?, ?, ?)`,
        [cuponId, pedidoId, monto]
    );

    const [updateResult] = await connection.execute(
        `UPDATE cupones SET usos_actuales = usos_actuales + 1, updated_at = NOW() WHERE id = ?`,
        [cuponId]
    );

    if (updateResult.affectedRows === 0) {
        throw new Error('Cupón no encontrado al actualizar usos');
    }
}

module.exports = {
    normalizeCodigo,
    calcularMontoDescuento,
    validateCoupon,
    redeemCoupon
};
