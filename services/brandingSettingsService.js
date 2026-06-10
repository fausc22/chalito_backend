function getDb() {
    return require('../controllers/dbPromise');
}

const BUSINESS_NAME = (process.env.NOMBRE_LOCAL || process.env.NOMBRE_NEGOCIO || 'El Chalito').trim();

const COLOR_KEYS = {
    COLOR_PRIMARIO: 'COLOR_PRIMARIO',
    TIENDA_COLOR_PRIMARIO: 'TIENDA_COLOR_PRIMARIO',
    TIENDA_COLOR_SECUNDARIO: 'TIENDA_COLOR_SECUNDARIO'
};

const DEFAULT_COLOR_PRIMARIO = '#0D0D0D';
const DEFAULT_COLOR_SECUNDARIO = '#EA580C';
const HEX_REGEX = /^#[0-9A-F]{6}$/i;

const CACHE_TTL_MS = 30_000;
let settingsCache = null;
let settingsCacheAt = 0;

const normalizeHex = (value, fallback) => {
    const raw = String(value || '').trim().toUpperCase();
    if (HEX_REGEX.test(raw)) return raw;
    return fallback;
};

const fetchRawMap = async () => {
    const claves = Object.values(COLOR_KEYS);
    const placeholders = claves.map(() => '?').join(',');
    const [rows] = await getDb().execute(
        `SELECT clave, valor FROM configuracion_sistema WHERE clave IN (${placeholders})`,
        claves
    );
    return rows.reduce((acc, row) => {
        acc[row.clave] = row.valor;
        return acc;
    }, {});
};

const mapToBranding = (map) => {
    const colorPanel = normalizeHex(map[COLOR_KEYS.COLOR_PRIMARIO], DEFAULT_COLOR_PRIMARIO);
    const colorPrimario = normalizeHex(
        map[COLOR_KEYS.TIENDA_COLOR_PRIMARIO] || map[COLOR_KEYS.COLOR_PRIMARIO],
        colorPanel
    );
    const colorSecundario = normalizeHex(
        map[COLOR_KEYS.TIENDA_COLOR_SECUNDARIO],
        DEFAULT_COLOR_SECUNDARIO
    );

    return {
        nombreNegocio: BUSINESS_NAME,
        logoUrl: null,
        colorPrimario,
        colorSecundario
    };
};

const getSettings = async () => {
    const now = Date.now();
    if (settingsCache && now - settingsCacheAt < CACHE_TTL_MS) {
        return { ...settingsCache };
    }

    try {
        const map = await fetchRawMap();
        const settings = mapToBranding(map);
        settingsCache = settings;
        settingsCacheAt = now;
        return { ...settings };
    } catch (error) {
        console.error('Error leyendo branding, usando defaults:', error.message);
        return {
            nombreNegocio: BUSINESS_NAME,
            logoUrl: null,
            colorPrimario: DEFAULT_COLOR_PRIMARIO,
            colorSecundario: DEFAULT_COLOR_SECUNDARIO
        };
    }
};

const getPublicBranding = async () => {
    const carouselSettingsService = require('./carouselSettingsService');
    const [settings, carousel] = await Promise.all([
        getSettings(),
        carouselSettingsService.getPublicCarousel()
    ]);

    return {
        ...settings,
        carousel
    };
};

const getTiendaApariencia = async () => {
    const settings = await getSettings();
    return {
        colorPrimario: settings.colorPrimario,
        colorSecundario: settings.colorSecundario,
        nombreNegocio: settings.nombreNegocio,
        logoUrl: settings.logoUrl
    };
};

const updateTiendaApariencia = async ({ colorPrimario, colorSecundario }) => {
    const updates = [];

    if (colorPrimario !== undefined) {
        const hex = normalizeHex(colorPrimario, DEFAULT_COLOR_PRIMARIO);
        updates.push([COLOR_KEYS.TIENDA_COLOR_PRIMARIO, hex, 'STRING']);
    }
    if (colorSecundario !== undefined) {
        const hex = normalizeHex(colorSecundario, DEFAULT_COLOR_SECUNDARIO);
        updates.push([COLOR_KEYS.TIENDA_COLOR_SECUNDARIO, hex, 'STRING']);
    }

    for (const [clave, valor, tipo] of updates) {
        await getDb().execute(
            `UPDATE configuracion_sistema SET valor = ?, tipo = ? WHERE clave = ?`,
            [valor, tipo, clave]
        );
    }

    invalidateCache();
    return getTiendaApariencia();
};

const invalidateCache = () => {
    settingsCache = null;
    settingsCacheAt = 0;
};

module.exports = {
    KEYS: COLOR_KEYS,
    BUSINESS_NAME,
    getSettings,
    getPublicBranding,
    getTiendaApariencia,
    updateTiendaApariencia,
    invalidateCache,
    normalizeHex
};
