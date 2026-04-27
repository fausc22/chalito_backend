const db = require('../controllers/dbPromise');

const DECIMAL_KEYS = new Set([
    'totalVendido',
    'subtotalVendido',
    'ivaTotal',
    'descuentoTotal',
    'ticketPromedio',
    'ventaMinima',
    'ventaMaxima',
    'totalGenerado',
    'precioPromedio'
]);

const INT_KEYS = new Set([
    'cantidadVentas',
    'articuloId',
    'cantidadVendida',
    'hora',
    'cantidadPedidos',
    'limit'
]);

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeNumericObject = (row = {}) => {
    const normalized = { ...row };

    for (const key of Object.keys(normalized)) {
        if (DECIMAL_KEYS.has(key)) {
            normalized[key] = toNumber(normalized[key], 0);
            continue;
        }

        if (INT_KEYS.has(key)) {
            normalized[key] = toInt(normalized[key], 0);
        }
    }

    return normalized;
};

const pad2 = (value) => String(value).padStart(2, '0');

const buildFranja = (hour) => {
    const hora = toInt(hour, 0);
    const siguiente = (hora + 1) % 24;
    return `${pad2(hora)}:00 - ${pad2(siguiente)}:00`;
};

const normalizeDateOutput = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

const obtenerDashboardReportes = async ({ desdeDateTime, hastaDateTime, limit }) => {
    const limitSeguro = Math.max(toInt(limit, 10), 1);

    const resumenQuery = `
        SELECT
            COUNT(*) AS cantidadVentas,
            COALESCE(SUM(total), 0) AS totalVendido,
            COALESCE(SUM(subtotal), 0) AS subtotalVendido,
            COALESCE(SUM(iva_total), 0) AS ivaTotal,
            COALESCE(SUM(descuento), 0) AS descuentoTotal,
            COALESCE(AVG(total), 0) AS ticketPromedio,
            COALESCE(MIN(total), 0) AS ventaMinima,
            COALESCE(MAX(total), 0) AS ventaMaxima
        FROM ventas
        WHERE fecha BETWEEN ? AND ?
          AND estado = 'FACTURADA'
    `;

    const ventasPorDiaQuery = `
        SELECT
            DATE(fecha) AS dia,
            COUNT(*) AS cantidadVentas,
            COALESCE(SUM(total), 0) AS totalVendido,
            COALESCE(AVG(total), 0) AS ticketPromedio
        FROM ventas
        WHERE fecha BETWEEN ? AND ?
          AND estado = 'FACTURADA'
        GROUP BY DATE(fecha)
        ORDER BY dia ASC
    `;

    const productosMasVendidosQuery = `
        SELECT
            vc.articulo_id AS articuloId,
            vc.articulo_nombre AS articuloNombre,
            COALESCE(SUM(vc.cantidad), 0) AS cantidadVendida,
            COALESCE(SUM(vc.subtotal), 0) AS totalGenerado,
            COALESCE(AVG(vc.precio), 0) AS precioPromedio
        FROM ventas_contenido vc
        INNER JOIN ventas v ON v.id = vc.venta_id
        WHERE v.fecha BETWEEN ? AND ?
          AND v.estado = 'FACTURADA'
        GROUP BY vc.articulo_id, vc.articulo_nombre
        ORDER BY cantidadVendida DESC
        LIMIT ${limitSeguro}
    `;

    const horariosDemandaQuery = `
        SELECT
            HOUR(fecha) AS hora,
            COUNT(*) AS cantidadPedidos
        FROM pedidos
        WHERE fecha BETWEEN ? AND ?
          AND estado <> 'CANCELADO'
        GROUP BY HOUR(fecha)
        ORDER BY hora ASC
    `;

    const mediosPagoQuery = `
        SELECT
            COALESCE(NULLIF(TRIM(medio_pago), ''), 'SIN_MEDIO_PAGO') AS medioPago,
            COUNT(*) AS cantidadVentas,
            COALESCE(SUM(total), 0) AS totalVendido
        FROM ventas
        WHERE fecha BETWEEN ? AND ?
          AND estado = 'FACTURADA'
        GROUP BY COALESCE(NULLIF(TRIM(medio_pago), ''), 'SIN_MEDIO_PAGO')
        ORDER BY totalVendido DESC
    `;

    const origenesQuery = `
        SELECT
            COALESCE(NULLIF(TRIM(origen_pedido), ''), 'SIN_ORIGEN') AS origenPedido,
            COUNT(*) AS cantidadPedidos
        FROM pedidos
        WHERE fecha BETWEEN ? AND ?
          AND estado <> 'CANCELADO'
        GROUP BY COALESCE(NULLIF(TRIM(origen_pedido), ''), 'SIN_ORIGEN')
        ORDER BY cantidadPedidos DESC
    `;

    const modalidadesQuery = `
        SELECT
            COALESCE(NULLIF(TRIM(modalidad), ''), 'SIN_MODALIDAD') AS modalidad,
            COUNT(*) AS cantidadPedidos
        FROM pedidos
        WHERE fecha BETWEEN ? AND ?
          AND estado <> 'CANCELADO'
        GROUP BY COALESCE(NULLIF(TRIM(modalidad), ''), 'SIN_MODALIDAD')
        ORDER BY cantidadPedidos DESC
    `;

    const [
        [resumenRows],
        [ventasPorDiaRows],
        [productosMasVendidosRows],
        [horariosDemandaRows],
        [mediosPagoRows],
        [origenesRows],
        [modalidadesRows]
    ] = await Promise.all([
        db.execute(resumenQuery, [desdeDateTime, hastaDateTime]),
        db.execute(ventasPorDiaQuery, [desdeDateTime, hastaDateTime]),
        db.execute(productosMasVendidosQuery, [desdeDateTime, hastaDateTime]),
        db.execute(horariosDemandaQuery, [desdeDateTime, hastaDateTime]),
        db.execute(mediosPagoQuery, [desdeDateTime, hastaDateTime]),
        db.execute(origenesQuery, [desdeDateTime, hastaDateTime]),
        db.execute(modalidadesQuery, [desdeDateTime, hastaDateTime])
    ]);

    const resumenBase = resumenRows?.[0] || {};
    const resumen = normalizeNumericObject({
        cantidadVentas: 0,
        totalVendido: 0,
        subtotalVendido: 0,
        ivaTotal: 0,
        descuentoTotal: 0,
        ticketPromedio: 0,
        ventaMinima: 0,
        ventaMaxima: 0,
        ...resumenBase
    });

    const ventasPorDia = (ventasPorDiaRows || []).map((row) => ({
        dia: normalizeDateOutput(row.dia),
        cantidadVentas: toInt(row.cantidadVentas, 0),
        totalVendido: toNumber(row.totalVendido, 0),
        ticketPromedio: toNumber(row.ticketPromedio, 0)
    }));

    const productosMasVendidos = (productosMasVendidosRows || []).map((row) =>
        normalizeNumericObject({
            articuloId: row.articuloId,
            articuloNombre: row.articuloNombre,
            cantidadVendida: row.cantidadVendida,
            totalGenerado: row.totalGenerado,
            precioPromedio: row.precioPromedio
        })
    );

    const horariosDemanda = (horariosDemandaRows || []).map((row) => {
        const hora = toInt(row.hora, 0);
        return {
            hora,
            franja: buildFranja(hora),
            cantidadPedidos: toInt(row.cantidadPedidos, 0)
        };
    });

    const mediosPago = (mediosPagoRows || []).map((row) => ({
        medioPago: row.medioPago,
        cantidadVentas: toInt(row.cantidadVentas, 0),
        totalVendido: toNumber(row.totalVendido, 0)
    }));

    const origenes = (origenesRows || []).map((row) => ({
        origenPedido: row.origenPedido,
        cantidadPedidos: toInt(row.cantidadPedidos, 0)
    }));

    const modalidades = (modalidadesRows || []).map((row) => ({
        modalidad: row.modalidad,
        cantidadPedidos: toInt(row.cantidadPedidos, 0)
    }));

    return {
        resumen,
        ventasPorDia,
        productosMasVendidos,
        horariosDemanda,
        mediosPago,
        origenes,
        modalidades
    };
};

module.exports = {
    obtenerDashboardReportes
};
