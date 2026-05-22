const { obtenerUrlsBaseCheckoutProNormalizadas } = require('./mercadoPagoPreferenciaUrlHelper');
const MercadoPagoWorker = require('../workers/MercadoPagoWorker');

async function getIntegracionEstado() {
    const accessTokenConfigured = Boolean(String(process.env.MP_ACCESS_TOKEN || '').trim());
    const webhookSecretConfigured = Boolean(String(process.env.MP_WEBHOOK_SECRET || '').trim());
    const cartaFrontendUrl = String(process.env.CARTA_FRONTEND_URL || '').trim() || null;
    const backendUrl = String(process.env.BACKEND_URL || '').trim() || null;

    let urlsPublicasValidas = false;
    let urlsError = null;
    let cartaNormalized = cartaFrontendUrl;
    let backendNormalized = backendUrl;

    try {
        const urls = obtenerUrlsBaseCheckoutProNormalizadas();
        cartaNormalized = urls.cartaFrontendBaseUrl;
        backendNormalized = urls.backendBaseUrl;
        urlsPublicasValidas = true;
    } catch (error) {
        urlsError = error.message;
    }

    const webhookUrl = backendNormalized
        ? `${backendNormalized}/api/carta-publica/checkout/mercadopago/webhook`
        : null;
    const backUrlsBase = cartaNormalized
        ? `${cartaNormalized}/checkout/resultado?session_id={session_id}`
        : null;

    const worker = MercadoPagoWorker.getStatus();

    return {
        accessTokenConfigured,
        webhookSecretConfigured,
        cartaFrontendUrl: cartaNormalized || cartaFrontendUrl,
        backendUrl: backendNormalized || backendUrl,
        webhookUrl,
        backUrlsBase,
        urlsPublicasValidas,
        urlsError,
        worker,
        checkoutProDisponible: accessTokenConfigured && urlsPublicasValidas
    };
}

module.exports = {
    getIntegracionEstado
};
