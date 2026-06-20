const whatsappService = require('./whatsappService');
const { normalizeWaMeNumber } = require('./whatsappPhoneUtils');

const resolveNumeroContactoConFuente = (configuredDb = '') => {
    const estado = whatsappService.obtenerEstado();
    if (estado?.connected && estado?.phone) {
        const fromBaileys = normalizeWaMeNumber(estado.phone);
        if (fromBaileys) {
            return { numero: fromBaileys, fuente: 'baileys' };
        }
    }

    const envNum = String(process.env.WHATSAPP_NUMERO_CONTACTO ?? '').trim();
    if (envNum) {
        const fromEnv = normalizeWaMeNumber(envNum);
        if (fromEnv) {
            return { numero: fromEnv, fuente: 'env' };
        }
    }

    const configuredTrim = String(configuredDb ?? '').trim();
    if (configuredTrim) {
        const fromDb = normalizeWaMeNumber(configuredTrim);
        if (fromDb) {
            return { numero: fromDb, fuente: 'db' };
        }
    }

    return { numero: null, fuente: null };
};

const resolveNumeroContacto = (configuredDb = '') => {
    const { numero } = resolveNumeroContactoConFuente(configuredDb);
    return numero;
};

module.exports = {
    resolveNumeroContactoConFuente,
    resolveNumeroContacto,
};
