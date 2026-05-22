const db = require('../controllers/dbPromise');

const KEYS = {
    TIENDA_ONLINE_ACTIVA: 'TIENDA_ONLINE_ACTIVA',
    VALIDAR_HORARIOS_CHECKOUT: 'VALIDAR_HORARIOS_CHECKOUT',
    TOLERANCIA_CIERRE_MINUTOS: 'TOLERANCIA_CIERRE_MINUTOS'
};

const CACHE_TTL_MS = 30_000;
let settingsCache = null;
let settingsCacheAt = 0;
let testSettingsOverride = null;

const RAW_ENV_VALIDATION = process.env.ENABLE_STORE_HOURS_VALIDATION;

const parseBoolean = (value, defaultValue = true) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return defaultValue;
};

const parseIntSafe = (value, defaultValue) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const envValidationEnabled = () => {
    if (RAW_ENV_VALIDATION === undefined) return true;
    const value = String(RAW_ENV_VALIDATION).trim().toLowerCase();
    if (value === 'false' || value === '0' || value === 'off' || value === 'no') {
        return false;
    }
    return true;
};

const fetchSettingsFromDb = async () => {
    const [rows] = await db.execute(
        `SELECT clave, valor, tipo FROM configuracion_sistema
         WHERE clave IN (?, ?, ?)`,
        [KEYS.TIENDA_ONLINE_ACTIVA, KEYS.VALIDAR_HORARIOS_CHECKOUT, KEYS.TOLERANCIA_CIERRE_MINUTOS]
    );

    const map = rows.reduce((acc, row) => {
        acc[row.clave] = row.valor;
        return acc;
    }, {});

    return {
        tiendaOnlineActiva: parseBoolean(map[KEYS.TIENDA_ONLINE_ACTIVA], true),
        validarHorarios: parseBoolean(map[KEYS.VALIDAR_HORARIOS_CHECKOUT], envValidationEnabled()),
        toleranceMinutes: parseIntSafe(map[KEYS.TOLERANCIA_CIERRE_MINUTOS], 5)
    };
};

const getSettings = async () => {
    if (testSettingsOverride) {
        return { ...testSettingsOverride };
    }

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
        console.error('Error leyendo settings tienda online, usando defaults:', error.message);
        return {
            tiendaOnlineActiva: true,
            validarHorarios: envValidationEnabled(),
            toleranceMinutes: 5
        };
    }
};

const isStoreHoursValidationEnabled = async () => {
    const settings = await getSettings();
    return settings.validarHorarios;
};

const updateSettings = async ({ tiendaOnlineActiva, validarHorarios, toleranceMinutes }) => {
    const updates = [];

    if (tiendaOnlineActiva !== undefined) {
        updates.push([KEYS.TIENDA_ONLINE_ACTIVA, tiendaOnlineActiva ? 'true' : 'false', 'BOOLEAN']);
    }
    if (validarHorarios !== undefined) {
        updates.push([KEYS.VALIDAR_HORARIOS_CHECKOUT, validarHorarios ? 'true' : 'false', 'BOOLEAN']);
    }
    if (toleranceMinutes !== undefined) {
        updates.push([KEYS.TOLERANCIA_CIERRE_MINUTOS, String(toleranceMinutes), 'INT']);
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

const setTestSettingsOverride = (settings) => {
    testSettingsOverride = settings;
    invalidateCache();
};

const clearTestSettingsOverride = () => {
    testSettingsOverride = null;
    invalidateCache();
};

module.exports = {
    KEYS,
    getSettings,
    updateSettings,
    isStoreHoursValidationEnabled,
    invalidateCache,
    setTestSettingsOverride,
    clearTestSettingsOverride
};
