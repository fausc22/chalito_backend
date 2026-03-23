/**
 * Configuración para validación de horarios de atención del local.
 * Centraliza la lectura de la variable de entorno.
 *
 * Variable de entorno:
 *   ENABLE_STORE_HOURS_VALIDATION=true|false
 *
 * - true  (o no definida): la validación horaria está activa (comportamiento actual)
 * - false / 0 / off / no: se desactiva la validación (bypass de horarios)
 */

const RAW_ENV_VALUE = process.env.ENABLE_STORE_HOURS_VALIDATION;

function isStoreHoursValidationEnabled() {
    // Si no está definida, mantener comportamiento actual: validación ACTIVADA
    if (RAW_ENV_VALUE === undefined) {
        return true;
    }

    const value = String(RAW_ENV_VALUE).trim().toLowerCase();

    if (value === 'false' || value === '0' || value === 'off' || value === 'no') {
        return false;
    }

    return true;
}

module.exports = {
    isStoreHoursValidationEnabled
};

