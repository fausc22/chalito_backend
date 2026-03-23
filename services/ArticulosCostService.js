const db = require('../controllers/dbPromise');

const UNIDADES_VALIDAS = new Set(['GRAMOS', 'KILOS', 'LITROS', 'UNIDADES']);

const ERROR_CODES = {
    ARTICULO_NO_ENCONTRADO: 'ARTICULO_NO_ENCONTRADO',
    ARTICULO_NO_ELABORADO: 'ARTICULO_NO_ELABORADO'
};

const redondear = (valor, decimales = 2) => {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return 0;
    const factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
};

const convertirCantidadAUnidadBase = (cantidad, unidadOriginal, unidadBase) => {
    if (!UNIDADES_VALIDAS.has(unidadOriginal) || !UNIDADES_VALIDAS.has(unidadBase)) {
        return {
            ok: false,
            motivo: 'UNIDAD_INVALIDA'
        };
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return {
            ok: false,
            motivo: 'CANTIDAD_INVALIDA'
        };
    }

    if (unidadOriginal === unidadBase) {
        return {
            ok: true,
            cantidadConvertida: cantidad
        };
    }

    if (unidadOriginal === 'GRAMOS' && unidadBase === 'KILOS') {
        return {
            ok: true,
            cantidadConvertida: cantidad / 1000
        };
    }

    if (unidadOriginal === 'KILOS' && unidadBase === 'GRAMOS') {
        return {
            ok: true,
            cantidadConvertida: cantidad * 1000
        };
    }

    // No inventar conversiones no definidas
    return {
        ok: false,
        motivo: 'UNIDADES_INCOMPATIBLES'
    };
};

const calcularCostoLinea = (row) => {
    const errores = [];

    const cantidadOriginal = parseFloat(row.cantidad_original);
    const unidadOriginal = row.unidad_original;
    const unidadBase = row.unidad_base;
    const costoUnitarioBase = row.costo_unitario_base !== null && row.costo_unitario_base !== undefined
        ? parseFloat(row.costo_unitario_base)
        : null;

    if (!unidadBase || !UNIDADES_VALIDAS.has(unidadBase)) {
        errores.push({
            codigo: 'UNIDAD_BASE_INVALIDA',
            mensaje: 'El ingrediente no tiene una unidad_base válida'
        });
    }

    if (costoUnitarioBase === null || !Number.isFinite(costoUnitarioBase) || costoUnitarioBase <= 0) {
        errores.push({
            codigo: 'COSTO_UNITARIO_INVALIDO',
            mensaje: 'El ingrediente no tiene un costo_unitario_base válido (> 0)'
        });
    }

    let cantidadConvertida = null;
    let costoLinea = null;

    const conversion = convertirCantidadAUnidadBase(
        cantidadOriginal,
        unidadOriginal,
        unidadBase
    );

    if (!conversion.ok) {
        errores.push({
            codigo: conversion.motivo,
            mensaje: conversion.motivo === 'UNIDADES_INCOMPATIBLES'
                ? 'Unidad de la receta incompatible con la unidad_base del ingrediente'
                : 'Cantidad o unidad inválida para conversión'
        });
    } else {
        cantidadConvertida = conversion.cantidadConvertida;
    }

    if (errores.length === 0) {
        costoLinea = cantidadConvertida * costoUnitarioBase;
    }

    return {
        detalle: {
            ingrediente_id: row.ingrediente_id,
            ingrediente_nombre: row.ingrediente_nombre,
            cantidad_original: cantidadOriginal,
            unidad_original: unidadOriginal,
            unidad_base: unidadBase,
            cantidad_convertida: cantidadConvertida !== null ? redondear(cantidadConvertida, 4) : null,
            costo_unitario_base: costoUnitarioBase,
            costo_linea: costoLinea !== null ? redondear(costoLinea, 2) : null
        },
        errores
    };
};

const calcularCostoArticuloElaborado = async (articuloId) => {
    // 1) Obtener artículo
    const [articulos] = await db.execute(
        `SELECT id, nombre, tipo, precio, activo
         FROM articulos
         WHERE id = ?`,
        [articuloId]
    );

    if (!articulos || articulos.length === 0) {
        return {
            status: 'ERROR',
            code: ERROR_CODES.ARTICULO_NO_ENCONTRADO
        };
    }

    const articulo = articulos[0];

    if (!articulo.activo) {
        return {
            status: 'ERROR',
            code: ERROR_CODES.ARTICULO_NO_ENCONTRADO
        };
    }

    if (articulo.tipo !== 'ELABORADO') {
        return {
            status: 'ERROR',
            code: ERROR_CODES.ARTICULO_NO_ELABORADO,
            articulo: {
                id: articulo.id,
                nombre: articulo.nombre,
                tipo: articulo.tipo,
                precio: articulo.precio
            }
        };
    }

    // 2) Obtener contenido con datos de ingredientes para costo interno
    const [rows] = await db.execute(
        `SELECT
            ac.ingrediente_id,
            i.nombre AS ingrediente_nombre,
            ac.cantidad AS cantidad_original,
            ac.unidad_medida AS unidad_original,
            i.unidad_base,
            i.costo_unitario_base
         FROM articulos_contenido ac
         INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
         WHERE ac.articulo_id = ?
         ORDER BY i.nombre ASC`,
        [articuloId]
    );

    const detalles = [];
    const errores_conversion = [];
    let costoTotal = 0;

    for (const row of rows) {
        const { detalle, errores } = calcularCostoLinea(row);
        detalles.push(detalle);

        if (errores.length > 0) {
            errores_conversion.push({
                ingrediente_id: row.ingrediente_id,
                ingrediente_nombre: row.ingrediente_nombre,
                unidad_original: row.unidad_original,
                unidad_base: row.unidad_base,
                cantidad_original: parseFloat(row.cantidad_original),
                errores
            });
        } else if (detalle.costo_linea !== null) {
            costoTotal += detalle.costo_linea;
        }
    }

    const precioVenta = articulo.precio !== null && articulo.precio !== undefined
        ? parseFloat(articulo.precio)
        : 0;

    const costoTotalRedondeado = redondear(costoTotal, 2);
    const margenBruto = redondear(precioVenta - costoTotalRedondeado, 2);
    const margenPorcentaje = precioVenta > 0
        ? redondear((margenBruto / precioVenta) * 100, 2)
        : null;

    return {
        status: 'OK',
        data: {
            articulo_id: articulo.id,
            articulo_nombre: articulo.nombre,
            tipo: articulo.tipo,
            precio_venta: precioVenta,
            costo_total: costoTotalRedondeado,
            margen_bruto: margenBruto,
            margen_porcentaje: margenPorcentaje,
            detalles,
            errores_conversion
        }
    };
};

module.exports = {
    calcularCostoArticuloElaborado,
    ERROR_CODES
};

