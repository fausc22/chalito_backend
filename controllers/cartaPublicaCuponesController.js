const db = require('./dbPromise');
const { calcularPricingCompleto } = require('../services/cartaPedidoPricingService');

const validarCuponCarta = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { couponCode, items } = req.validatedData;

        await connection.beginTransaction();
        const pricing = await calcularPricingCompleto(connection, items, couponCode);
        await connection.rollback();

        const { desglose, montoDescuento, totalBruto, cupon } = pricing;

        if (!cupon) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: 'Cupón no válido'
            });
        }

        res.json({
            success: true,
            valid: true,
            codigo: cupon.codigo,
            montoDescuento,
            subtotalBruto: totalBruto,
            totalFinal: desglose.total,
            desglose: {
                subtotal: desglose.subtotal,
                iva_total: desglose.iva_total,
                total: desglose.total
            }
        });
    } catch (error) {
        try { await connection.rollback(); } catch (_) { /* noop */ }

        if (error.code === 'CUPON_INVALIDO') {
            return res.status(400).json({
                success: false,
                valid: false,
                message: error.message
            });
        }

        console.error('Error validando cupón:', error);
        res.status(400).json({
            success: false,
            valid: false,
            message: error.message || 'Error al validar cupón'
        });
    } finally {
        connection.release();
    }
};

module.exports = {
    validarCuponCarta
};
