/**
 * Cálculo compartido de carrito web (ítems + cupón + totales).
 */
const {
    validarExtrasNoDobleYTriple,
    construirPersonalizaciones,
    parsearExtrasDelPayload,
    construirSnapshotExtrasDesdeDb
} = require('./PersonalizacionesService');
const { calcularTotalesDesdePrecioFinal } = require('./totalesPrecioFinal');
const couponService = require('./couponService');

function mapCartaItemsToMpFormat(items = []) {
    return items.map((item) => ({
        articulo_id: item.productId ?? item.articulo_id,
        cantidad: item.quantity ?? item.cantidad,
        observaciones: item.itemNotes ?? item.observaciones ?? null,
        extras: (item.selectedExtras || item.extras || []).map((extra) => {
            if (typeof extra === 'object' && extra != null) {
                const mapped = { id: extra.id };
                if (extra.cantidad != null) {
                    mapped.cantidad = extra.cantidad;
                }
                return mapped;
            }
            return { id: extra };
        })
    }));
}

/**
 * Extrae el array crudo de extras de un ítem de pedido web o MP.
 */
function extraerExtrasCrudosDelItem(item = {}) {
    if (Array.isArray(item.selectedExtras)) {
        return item.selectedExtras;
    }
    if (Array.isArray(item.extras)) {
        return item.extras;
    }
    return [];
}

/**
 * Normaliza ítems del payload de pedido web (productId) o MP (articulo_id).
 */
async function calcularCarritoDesdeItems(connection, items = []) {
    const articulosNormalizados = [];

    for (const item of items) {
        const productId = Number(item.productId ?? item.articulo_id);
        const quantity = Number(item.quantity ?? item.cantidad);
        const extrasCrudos = extraerExtrasCrudosDelItem(item);
        const extrasParsed = parsearExtrasDelPayload(extrasCrudos);

        if (!Number.isInteger(productId) || productId <= 0) {
            throw new Error(`productId inválido: ${item.productId ?? item.articulo_id}`);
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error('La cantidad debe ser mayor a 0');
        }

        const [articuloRows] = await connection.execute(
            'SELECT id, nombre, precio, controla_stock FROM articulos WHERE id = ? AND activo = 1',
            [productId]
        );

        if (articuloRows.length === 0) {
            throw new Error(`Producto no encontrado o no disponible: ${productId}`);
        }

        const articulo = articuloRows[0];
        const precioBase = parseFloat(articulo.precio) || 0;

        let extrasSnapshot = [];
        let extrasTotal = 0;

        if (extrasParsed.length > 0) {
            const ids = extrasParsed.map((e) => e.id);
            const placeholders = ids.map(() => '?').join(',');
            const [adicionalesRows] = await connection.execute(
                `SELECT a.id, a.nombre, a.precio_extra, a.permite_cantidad, a.disponible
                 FROM adicionales a
                 INNER JOIN adicionales_contenido ac ON a.id = ac.adicional_id AND ac.articulo_id = ?
                 WHERE a.id IN (${placeholders}) AND a.disponible = 1`,
                [productId, ...ids]
            );

            if (adicionalesRows.length !== ids.length) {
                throw new Error(
                    `Uno o más adicionales no son válidos para el artículo ${articulo.nombre} (productId: ${productId})`
                );
            }

            const resultado = construirSnapshotExtrasDesdeDb(adicionalesRows, extrasParsed);
            extrasSnapshot = resultado.extrasSnapshot;
            extrasTotal = resultado.extrasTotal;
        }

        const precioUnitario = precioBase + extrasTotal;
        const subtotal = precioUnitario * quantity;

        articulosNormalizados.push({
            articulo_id: articulo.id,
            articulo_nombre: articulo.nombre,
            cantidad: quantity,
            precio: precioUnitario,
            precio_unitario: precioUnitario,
            subtotal,
            personalizaciones: extrasSnapshot.length > 0 ? construirPersonalizaciones(extrasSnapshot) : null,
            observaciones: item.itemNotes ?? item.observaciones ?? null
        });
    }

    const totalBruto = articulosNormalizados.reduce((sum, a) => sum + a.subtotal, 0);

    return {
        articulosNormalizados,
        totalBruto
    };
}

async function aplicarCuponATotal(totalBruto, couponCode, connection = null) {
    const totalBase = Number(totalBruto) || 0;
    const codigo = couponService.normalizeCodigo(couponCode);

    if (!codigo) {
        const desglose = calcularTotalesDesdePrecioFinal(totalBase);
        return {
            totalBruto: totalBase,
            montoDescuento: 0,
            cupon: null,
            desglose
        };
    }

    const validation = await couponService.validateCoupon(codigo, totalBase, connection);
    if (!validation.valid) {
        const err = new Error(validation.message || 'Cupón no válido');
        err.code = 'CUPON_INVALIDO';
        throw err;
    }

    const totalNeto = Math.max(0, totalBase - validation.montoDescuento);
    const desglose = calcularTotalesDesdePrecioFinal(totalNeto);

    return {
        totalBruto: totalBase,
        montoDescuento: validation.montoDescuento,
        cupon: {
            id: validation.cuponId,
            codigo: validation.codigo,
            tipo: validation.tipo,
            valor: validation.valor
        },
        desglose
    };
}

async function calcularPricingCompleto(connection, items = [], couponCode = null) {
    const { articulosNormalizados, totalBruto } = await calcularCarritoDesdeItems(connection, items);
    const pricing = await aplicarCuponATotal(totalBruto, couponCode, connection);

    return {
        articulosNormalizados,
        ...pricing
    };
}

module.exports = {
    mapCartaItemsToMpFormat,
    extraerExtrasCrudosDelItem,
    calcularCarritoDesdeItems,
    aplicarCuponATotal,
    calcularPricingCompleto
};
