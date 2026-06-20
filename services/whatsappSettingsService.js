function getDb() {
    return require('../controllers/dbPromise');
}

const { resolveNumeroContactoConFuente } = require('./whatsappContactResolver');
const {
    TEMPLATE_KEYS,
    TEMPLATE_DB_KEYS,
    CLIENTE_LOCAL_TEMPLATE_DB_KEYS,
    DEFAULT_TEMPLATES,
    DEFAULT_TEMPLATES_CLIENTE_LOCAL,
    DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    getDefaultTemplatesCopy,
    getDefaultClienteLocalTemplatesCopy,
} = require('./whatsappTemplateDefaults');
const { isTemplateValid, isClienteLocalTemplateValid } = require('./whatsappTemplateValidator');

const KEYS = {
    NOTIFICACIONES_ACTIVAS: 'WHATSAPP_NOTIFICACIONES_ACTIVAS',
    ALIAS_TRANSFERENCIA: 'ALIAS_TRANSFERENCIA',
    CLIENTE_ENVIA_AL_LOCAL: 'WHATSAPP_CLIENTE_ENVIA_AL_LOCAL',
    NUMERO_CONTACTO: 'WHATSAPP_NUMERO_CONTACTO',
    TEMPLATE_CLIENTE_AL_LOCAL: 'WHATSAPP_TEMPLATE_CLIENTE_AL_LOCAL',
    ...TEMPLATE_DB_KEYS,
    ...CLIENTE_LOCAL_TEMPLATE_DB_KEYS,
};

const BUSINESS_NAME = (process.env.NOMBRE_LOCAL || process.env.NOMBRE_NEGOCIO || 'El Chalito').trim();

const CACHE_TTL_MS = 30_000;
let settingsCache = null;
let settingsCacheAt = 0;

const parseBoolean = (value, defaultValue = true) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return defaultValue;
};

const deriveModoPedidosWeb = ({ notificacionesActivas, clienteEnviaAlLocal }) => {
    const notif = parseBoolean(notificacionesActivas, false);
    const cliente = parseBoolean(clienteEnviaAlLocal, false);
    if (notif && cliente) {
        return 'desactivado';
    }
    if (notif) return 'local_a_cliente';
    if (cliente) return 'cliente_a_local';
    return 'desactivado';
};

const resolvePlantillaFromDb = (templateKey, dbValue) => {
    const trimmed = String(dbValue ?? '').trim();
    if (trimmed && isTemplateValid(templateKey, trimmed)) {
        return trimmed;
    }
    return DEFAULT_TEMPLATES[templateKey];
};

const resolvePlantillaClienteLocalFromDb = (templateKey, dbValue) => {
    const trimmed = String(dbValue ?? '').trim();
    if (trimmed && isClienteLocalTemplateValid(trimmed)) {
        return trimmed;
    }
    return DEFAULT_TEMPLATES_CLIENTE_LOCAL[templateKey];
};

const buildPlantillasFromMap = (map) => {
    const plantillas = {};
    for (const key of TEMPLATE_KEYS) {
        plantillas[key] = resolvePlantillaFromDb(key, map[TEMPLATE_DB_KEYS[key]]);
    }
    return plantillas;
};

const buildPlantillasClienteLocalFromMap = (map) => {
    const plantillas = {};
    for (const key of TEMPLATE_KEYS) {
        plantillas[key] = resolvePlantillaClienteLocalFromDb(key, map[CLIENTE_LOCAL_TEMPLATE_DB_KEYS[key]]);
    }
    return plantillas;
};

const fetchSettingsFromDb = async () => {
    const claves = [
        KEYS.NOTIFICACIONES_ACTIVAS,
        KEYS.ALIAS_TRANSFERENCIA,
        KEYS.CLIENTE_ENVIA_AL_LOCAL,
        KEYS.NUMERO_CONTACTO,
        KEYS.TEMPLATE_CLIENTE_AL_LOCAL,
        ...Object.values(TEMPLATE_DB_KEYS),
        ...Object.values(CLIENTE_LOCAL_TEMPLATE_DB_KEYS),
    ];
    const placeholders = claves.map(() => '?').join(',');
    const [rows] = await getDb().execute(
        `SELECT clave, valor FROM configuracion_sistema WHERE clave IN (${placeholders})`,
        claves
    );

    const map = rows.reduce((acc, row) => {
        acc[row.clave] = row.valor;
        return acc;
    }, {});

    const alias = (map[KEYS.ALIAS_TRANSFERENCIA] || process.env.ALIAS_TRANSFERENCIA || 'ALIAS.NO.CONFIGURADO').trim();

    const templateClienteAlLocal = String(
        map[KEYS.TEMPLATE_CLIENTE_AL_LOCAL] ?? DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL
    ).trim() || DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL;

    const base = {
        notificacionesActivas: parseBoolean(map[KEYS.NOTIFICACIONES_ACTIVAS], true),
        aliasTransferencia: alias,
        clienteEnviaAlLocal: parseBoolean(map[KEYS.CLIENTE_ENVIA_AL_LOCAL], false),
        numeroContacto: String(map[KEYS.NUMERO_CONTACTO] ?? '').trim(),
        templateClienteAlLocal,
        templateClienteAlLocalDefault: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
        nombreNegocio: BUSINESS_NAME,
        plantillas: buildPlantillasFromMap(map),
        plantillasDefault: getDefaultTemplatesCopy(),
        plantillasClienteLocal: buildPlantillasClienteLocalFromMap(map),
        plantillasClienteLocalDefault: getDefaultClienteLocalTemplatesCopy(),
    };

    const { numero, fuente } = resolveNumeroContactoConFuente(base.numeroContacto);

    return {
        ...base,
        modoPedidosWeb: deriveModoPedidosWeb(base),
        numeroContactoResuelto: numero,
        numeroContactoFuente: fuente,
    };
};

const getSettings = async () => {
    const now = Date.now();
    if (settingsCache && now - settingsCacheAt < CACHE_TTL_MS) {
        return {
            ...settingsCache,
            plantillas: { ...settingsCache.plantillas },
            plantillasClienteLocal: { ...settingsCache.plantillasClienteLocal },
        };
    }

    try {
        const settings = await fetchSettingsFromDb();
        settingsCache = settings;
        settingsCacheAt = now;
        return {
            ...settings,
            plantillas: { ...settings.plantillas },
            plantillasDefault: getDefaultTemplatesCopy(),
            plantillasClienteLocal: { ...settings.plantillasClienteLocal },
            plantillasClienteLocalDefault: getDefaultClienteLocalTemplatesCopy(),
        };
    } catch (error) {
        console.error('Error leyendo settings WhatsApp, usando defaults:', error.message);
        const fallback = {
            notificacionesActivas: true,
            aliasTransferencia: (process.env.ALIAS_TRANSFERENCIA || 'ALIAS.NO.CONFIGURADO').trim(),
            clienteEnviaAlLocal: false,
            numeroContacto: String(process.env.WHATSAPP_NUMERO_CONTACTO || '').trim(),
            templateClienteAlLocal: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
            templateClienteAlLocalDefault: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
            nombreNegocio: BUSINESS_NAME,
            plantillas: getDefaultTemplatesCopy(),
            plantillasDefault: getDefaultTemplatesCopy(),
            plantillasClienteLocal: getDefaultClienteLocalTemplatesCopy(),
            plantillasClienteLocalDefault: getDefaultClienteLocalTemplatesCopy(),
        };
        const { numero, fuente } = resolveNumeroContactoConFuente(fallback.numeroContacto);
        return {
            ...fallback,
            modoPedidosWeb: deriveModoPedidosWeb(fallback),
            numeroContactoResuelto: numero,
            numeroContactoFuente: fuente,
        };
    }
};

const updateSettings = async (payload = {}) => {
    const updates = [];

    if (payload.notificacionesActivas !== undefined) {
        updates.push([
            KEYS.NOTIFICACIONES_ACTIVAS,
            payload.notificacionesActivas ? 'true' : 'false',
            'BOOLEAN',
        ]);
    }
    if (payload.aliasTransferencia !== undefined) {
        updates.push([
            KEYS.ALIAS_TRANSFERENCIA,
            String(payload.aliasTransferencia || '').trim(),
            'STRING',
        ]);
    }
    if (payload.clienteEnviaAlLocal !== undefined) {
        updates.push([
            KEYS.CLIENTE_ENVIA_AL_LOCAL,
            payload.clienteEnviaAlLocal ? 'true' : 'false',
            'BOOLEAN',
        ]);
    }
    if (payload.numeroContacto !== undefined) {
        updates.push([
            KEYS.NUMERO_CONTACTO,
            String(payload.numeroContacto || '').trim(),
            'STRING',
        ]);
    }
    if (payload.templateClienteAlLocal !== undefined) {
        updates.push([
            KEYS.TEMPLATE_CLIENTE_AL_LOCAL,
            String(payload.templateClienteAlLocal ?? '').trim(),
            'STRING',
        ]);
    }

    if (payload.plantillas && typeof payload.plantillas === 'object') {
        for (const [templateKey, templateText] of Object.entries(payload.plantillas)) {
            if (!TEMPLATE_KEYS.includes(templateKey)) {
                continue;
            }
            updates.push([
                TEMPLATE_DB_KEYS[templateKey],
                String(templateText ?? '').trim(),
                'STRING',
            ]);
        }
    }

    if (payload.plantillasClienteLocal && typeof payload.plantillasClienteLocal === 'object') {
        for (const [templateKey, templateText] of Object.entries(payload.plantillasClienteLocal)) {
            if (!TEMPLATE_KEYS.includes(templateKey)) {
                continue;
            }
            updates.push([
                CLIENTE_LOCAL_TEMPLATE_DB_KEYS[templateKey],
                String(templateText ?? '').trim(),
                'STRING',
            ]);
        }
    }

    for (const [clave, valor, tipo] of updates) {
        await getDb().execute(
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

module.exports = {
    KEYS,
    TEMPLATE_KEYS,
    deriveModoPedidosWeb,
    resolveNumeroContactoConFuente,
    getSettings,
    updateSettings,
    invalidateCache,
    resolvePlantillaFromDb,
    resolvePlantillaClienteLocalFromDb,
};
