/**
 * Validación de firma HMAC para webhooks de Mercado Pago.
 * @see https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */

const crypto = require('crypto');

function parseSignatureHeader(signatureHeader) {
    const result = { ts: null, v1: null };
    if (!signatureHeader || typeof signatureHeader !== 'string') {
        return result;
    }
    const parts = signatureHeader.split(',');
    for (const part of parts) {
        const [key, ...valueParts] = part.split('=');
        const value = valueParts.join('=');
        if (key && key.trim() === 'ts') {
            result.ts = value;
        } else if (key && key.trim() === 'v1') {
            result.v1 = value;
        }
    }
    return result;
}

function buildManifest(dataId, requestId, ts) {
    let manifest = '';
    if (dataId != null && String(dataId).length > 0) {
        manifest += `id:${dataId};`;
    }
    if (requestId) {
        manifest += `request-id:${requestId};`;
    }
    manifest += `ts:${ts};`;
    return manifest;
}

function obtenerDataIdWebhook(req) {
    const q = req.query || {};
    const b = req.body || {};
    return q['data.id'] ?? b?.data?.id ?? q.id ?? b?.id ?? null;
}

/**
 * Anti-replay: valida edad del timestamp en x-signature.
 */
function verificarTimestampWebhookMp(maxAgeSeconds = 300) {
    return (req, res, next) => {
        const xSignature = req.headers['x-signature'];
        if (!xSignature) {
            next();
            return;
        }
        const { ts } = parseSignatureHeader(xSignature);
        if (!ts) {
            next();
            return;
        }
        const webhookTs = parseInt(ts, 10);
        if (Number.isNaN(webhookTs)) {
            next();
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const age = now - webhookTs;
        if (age > maxAgeSeconds) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`⚠️ [WebhookMP] Timestamp antiguo (${age}s), permitido en desarrollo`);
                next();
                return;
            }
            console.error(`❌ [WebhookMP] Timestamp expirado: ${age}s (max ${maxAgeSeconds}s)`);
            res.status(401).json({
                error: 'Webhook timestamp too old',
                code: 'TIMESTAMP_EXPIRED'
            });
            return;
        }
        next();
    };
}

function verificarFirmaWebhookMp() {
    return (req, res, next) => {
        const secret = process.env.MP_WEBHOOK_SECRET;

        if (!secret || String(secret).trim() === '') {
            if (process.env.NODE_ENV === 'production') {
                console.error('❌ [WebhookMP] MP_WEBHOOK_SECRET no configurado en producción');
                res.status(500).json({
                    error: 'Webhook secret not configured',
                    code: 'WEBHOOK_SECRET_MISSING'
                });
                return;
            }
            console.warn('⚠️ [WebhookMP] Sin MP_WEBHOOK_SECRET: firma no validada (solo desarrollo)');
            next();
            return;
        }

        const xSignature = req.headers['x-signature'];
        const xRequestId = req.headers['x-request-id'] || '';

        if (!xSignature) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('⚠️ [WebhookMP] Sin header x-signature (desarrollo)');
                next();
                return;
            }
            res.status(401).json({
                error: 'Missing signature header',
                code: 'SIGNATURE_MISSING'
            });
            return;
        }

        const { ts, v1 } = parseSignatureHeader(xSignature);
        if (!ts || !v1) {
            res.status(401).json({
                error: 'Invalid signature format',
                code: 'SIGNATURE_FORMAT_INVALID'
            });
            return;
        }

        const dataId = obtenerDataIdWebhook(req);
        if (dataId == null || String(dataId).length === 0) {
            res.status(400).json({
                error: 'Missing data.id in webhook',
                code: 'DATA_ID_MISSING'
            });
            return;
        }

        const manifest = buildManifest(String(dataId), String(xRequestId), ts);
        const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

        const received = Buffer.from(String(v1), 'utf8');
        const expectedBuf = Buffer.from(expected, 'utf8');
        let ok = false;
        if (received.length === expectedBuf.length) {
            ok = crypto.timingSafeEqual(received, expectedBuf);
        }

        if (!ok) {
            console.error('❌ [WebhookMP] Firma inválida', { dataId, xRequestId });
            res.status(401).json({
                error: 'Invalid signature',
                code: 'SIGNATURE_INVALID'
            });
            return;
        }

        next();
    };
}

module.exports = {
    verificarFirmaWebhookMp,
    verificarTimestampWebhookMp,
    parseSignatureHeader,
    obtenerDataIdWebhook
};
