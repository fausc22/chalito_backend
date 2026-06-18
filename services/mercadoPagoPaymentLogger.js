/**
 * Logging estructurado y contadores en memoria para operaciones MP.
 * Feature flag: MP_HARDENING_ENABLED (default true).
 */

const METRICAS = {
    webhooksProcesados: 0,
    aprobacionesCreadas: 0,
    aprobacionesRecuperadas: 0,
    aprobacionesIgnoradas: 0,
    rechazosRegistrados: 0,
    reconciliacionesEjecutadas: 0,
    locksFallidos: 0,
    erroresProcesamiento: 0
};

function isHardeningEnabled() {
    const raw = String(process.env.MP_HARDENING_ENABLED ?? 'true').trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function logMpEvent(level, event, payload = {}) {
    const entry = {
        ts: new Date().toISOString(),
        service: 'mercadopago',
        event,
        hardening: isHardeningEnabled(),
        ...payload
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.log(line);
}

function incrementMetric(key, amount = 1) {
    if (Object.prototype.hasOwnProperty.call(METRICAS, key)) {
        METRICAS[key] += amount;
    }
}

function getMetricasMp() {
    return { ...METRICAS, hardeningEnabled: isHardeningEnabled() };
}

function resetMetricasMp() {
    Object.keys(METRICAS).forEach((k) => {
        METRICAS[k] = 0;
    });
}

module.exports = {
    isHardeningEnabled,
    logMpEvent,
    incrementMetric,
    getMetricasMp,
    resetMetricasMp,
    METRICAS
};
