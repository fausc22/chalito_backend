const { obtenerDashboardReportes } = require('../services/reportes.service');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formatDateOnly = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isValidDateOnly = (value) => {
    if (!DATE_REGEX.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && formatDateOnly(parsed) === value;
};

const parsePositiveLimit = (value) => {
    if (value === undefined || value === null || value === '') {
        return 10;
    }

    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) {
        return null;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
};

const resolverFechas = (query = {}) => {
    const ahora = new Date();
    const desdeDefault = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
    const hastaDefault = formatDateOnly(ahora);

    const desde = query.desde ?? desdeDefault;
    const hasta = query.hasta ?? hastaDefault;

    if (!isValidDateOnly(desde)) {
        return { error: `El parámetro "desde" es inválido. Debe usar formato YYYY-MM-DD.` };
    }

    if (!isValidDateOnly(hasta)) {
        return { error: `El parámetro "hasta" es inválido. Debe usar formato YYYY-MM-DD.` };
    }

    if (desde > hasta) {
        return { error: 'El parámetro "desde" no puede ser mayor que "hasta".' };
    }

    return {
        desde,
        hasta,
        desdeDateTime: `${desde} 00:00:00`,
        hastaDateTime: `${hasta} 23:59:59`
    };
};

const getDashboardReportes = async (req, res) => {
    try {
        const fechas = resolverFechas(req.query || {});
        if (fechas.error) {
            return res.status(400).json({
                ok: false,
                message: fechas.error
            });
        }

        const limit = parsePositiveLimit(req.query?.limit);
        if (limit === null) {
            return res.status(400).json({
                ok: false,
                message: 'El parámetro "limit" debe ser un número entero positivo.'
            });
        }

        const data = await obtenerDashboardReportes({
            desdeDateTime: fechas.desdeDateTime,
            hastaDateTime: fechas.hastaDateTime,
            limit
        });

        return res.json({
            ok: true,
            filtros: {
                desde: fechas.desde,
                hasta: fechas.hasta,
                limit
            },
            data
        });
    } catch (error) {
        console.error('❌ Error al obtener dashboard de reportes:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error al obtener el dashboard de reportes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getDashboardReportes
};
