/**
 * Configuración para validación de horarios de atención del local.
 * Fuente de verdad: configuracion_sistema (VALIDAR_HORARIOS_CHECKOUT).
 * Fallback legacy: ENABLE_STORE_HOURS_VALIDATION en .env
 */
const tiendaOnlineSettingsService = require('../services/tiendaOnlineSettingsService');

async function isStoreHoursValidationEnabled() {
    return tiendaOnlineSettingsService.isStoreHoursValidationEnabled();
}

/** Versión sync con fallback env (solo para arranque sin await) */
function isStoreHoursValidationEnabledSync() {
    const RAW_ENV_VALUE = process.env.ENABLE_STORE_HOURS_VALIDATION;
    if (RAW_ENV_VALUE === undefined) return true;
    const value = String(RAW_ENV_VALUE).trim().toLowerCase();
    if (value === 'false' || value === '0' || value === 'off' || value === 'no') {
        return false;
    }
    return true;
}

module.exports = {
    isStoreHoursValidationEnabled,
    isStoreHoursValidationEnabledSync
};
