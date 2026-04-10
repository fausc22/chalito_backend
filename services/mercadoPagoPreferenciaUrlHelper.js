/**
 * Validación de URLs base para Mercado Pago Checkout Pro (back_urls + notification_url).
 * MP exige endpoints públicos HTTPS; http://localhost suele fallar con errores engañosos del API.
 */

const MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE =
    'Mercado Pago requiere URLs públicas HTTPS para back_urls y notification_url. '
    + 'No se permite localhost/http. Configurá CARTA_FRONTEND_URL y BACKEND_URL con HTTPS '
    + '(por ejemplo túnel ngrok o cloudflared).';

function esHostNoPublico(hostname) {
    if (!hostname) return true;
    const h = String(hostname).toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '::1') {
        return true;
    }
    if (h.endsWith('.localhost') || h.endsWith('.local')) {
        return true;
    }
    return false;
}

/**
 * @param {string|undefined} rawUrl
 * @param {string} nombreVariable - ej. CARTA_FRONTEND_URL
 * @returns {string} URL sin slash final
 */
function validarUrlBaseMercadoPagoCheckoutPro(rawUrl, nombreVariable) {
    const trimmed = String(rawUrl ?? '').trim();
    if (!trimmed) {
        throw new Error(`${nombreVariable} es obligatoria. ${MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE}`);
    }
    if (!trimmed.toLowerCase().startsWith('https://')) {
        throw new Error(MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE);
    }
    let u;
    try {
        u = new URL(trimmed);
    } catch {
        throw new Error(MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE);
    }
    if (u.protocol !== 'https:') {
        throw new Error(MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE);
    }
    if (esHostNoPublico(u.hostname)) {
        throw new Error(MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE);
    }
    return trimmed.replace(/\/+$/, '');
}

function obtenerUrlsBaseCheckoutProNormalizadas(env = process.env) {
    const carta = validarUrlBaseMercadoPagoCheckoutPro(env.CARTA_FRONTEND_URL, 'CARTA_FRONTEND_URL');
    const backend = validarUrlBaseMercadoPagoCheckoutPro(env.BACKEND_URL, 'BACKEND_URL');
    return { cartaFrontendBaseUrl: carta, backendBaseUrl: backend };
}

/**
 * @param {string} urlString
 */
function assertUrlHttpsPublicaMercadoPago(urlString, etiqueta = 'URL') {
    const s = String(urlString ?? '').trim();
    if (!s.toLowerCase().startsWith('https://')) {
        throw new Error(`${etiqueta}: ${MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE}`);
    }
    let u;
    try {
        u = new URL(s);
    } catch {
        throw new Error(`${etiqueta}: ${MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE}`);
    }
    if (u.protocol !== 'https:' || esHostNoPublico(u.hostname)) {
        throw new Error(`${etiqueta}: ${MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE}`);
    }
}

module.exports = {
    MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE,
    validarUrlBaseMercadoPagoCheckoutPro,
    obtenerUrlsBaseCheckoutProNormalizadas,
    assertUrlHttpsPublicaMercadoPago
};
