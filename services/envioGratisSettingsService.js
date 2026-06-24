const db = require('../controllers/dbPromise');

const KEYS = {
    ENVIO_GRATIS_ACTIVO: 'ENVIO_GRATIS_ACTIVO',
    ENVIO_GRATIS_MONTO_MINIMO: 'ENVIO_GRATIS_MONTO_MINIMO',
};

const CACHE_TTL_MS = 30_000;
let settingsCache = null;
let settingsCacheAt = 0;

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return defaultValue;
};

const parseNumber = (value, defaultValue = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : defaultValue;
};

const fetchSettingsFromDb = async () => {
    const [rows] = await db.execute(
        `SELECT clave, valor FROM configuracion_sistema WHERE clave IN (?, ?)`,
        [KEYS.ENVIO_GRATIS_ACTIVO, KEYS.ENVIO_GRATIS_MONTO_MINIMO]
    );

    const map = rows.reduce((acc, row) => {
        acc[row.clave] = row.valor;
        return acc;
    }, {});

    const activo = parseBoolean(map[KEYS.ENVIO_GRATIS_ACTIVO], false);
    const montoMinimo = parseNumber(map[KEYS.ENVIO_GRATIS_MONTO_MINIMO], 0);

    return {
        activo: activo && montoMinimo > 0,
        montoMinimo,
    };
};

const getSettings = async () => {
    const now = Date.now();
    if (settingsCache && now - settingsCacheAt < CACHE_TTL_MS) {
        return { ...settingsCache };
    }

    try {
        const settings = await fetchSettingsFromDb();
        settingsCache = settings;
        settingsCacheAt = now;
        return { ...settings };
    } catch (error) {
        console.error('Error leyendo envío gratis, usando defaults:', error.message);
        return { activo: false, montoMinimo: 0 };
    }
};

const updateSettings = async ({ activo, montoMinimo }) => {
    const updates = [];

    if (activo !== undefined) {
        updates.push([KEYS.ENVIO_GRATIS_ACTIVO, activo ? 'true' : 'false', 'BOOLEAN']);
    }
    if (montoMinimo !== undefined) {
        updates.push([KEYS.ENVIO_GRATIS_MONTO_MINIMO, String(parseNumber(montoMinimo, 0)), 'INT']);
    }

    for (const [clave, valor, tipo] of updates) {
        await db.execute(
            `UPDATE configuracion_sistema SET valor = ?, tipo = ? WHERE clave = ?`,
            [valor, tipo, clave]
        );
    }

    invalidateCache();
    return getSettings();
};

const invalidateCache = () => {
    settingsCache = null;
    settingsCacheAt = 0;
};

const aplicaEnvioGratis = async ({ total, modalidad }) => {
    const settings = await getSettings();
    if (!settings.activo) return false;

    const modality = String(modalidad || '').trim().toUpperCase();
    const isDelivery = modality === 'DELIVERY' || modality === 'ENVIO' || modality === 'ENVÍO';
    if (!isDelivery) return false;

    const orderTotal = parseNumber(total, 0);
    return orderTotal >= settings.montoMinimo;
};

module.exports = {
    KEYS,
    getSettings,
    updateSettings,
    invalidateCache,
    aplicaEnvioGratis,
};
