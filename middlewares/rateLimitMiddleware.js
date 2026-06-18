/**
 * Rate Limiting Middleware
 * - Staff autenticado (Bearer): sin límite en rutas internas del panel
 * - Login: protección anti brute-force
 * - Carta pública: límite por IP para clientes anónimos
 * - Health/metrics: límite al polling automático de fondo
 */

const requestCounts = new Map();

const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const rateLimitConfigs = {
    login: {
        windowMs: FIFTEEN_MINUTES_MS,
        maxRequests: 20,
        message: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.'
    },
    public: {
        windowMs: ONE_MINUTE_MS,
        maxRequests: 120,
        message: 'Demasiadas peticiones. Intente nuevamente en un minuto.'
    },
    strict: {
        windowMs: ONE_MINUTE_MS,
        maxRequests: 500,
        message: 'Límite de peticiones excedido. Intente nuevamente en un minuto.'
    },
    internal: {
        windowMs: ONE_MINUTE_MS,
        maxRequests: 300,
        message: 'Demasiadas peticiones internas. Intente nuevamente en un minuto.'
    }
};

const publicRoutePatterns = [
    /^\/carta-publica(?:\/|$)/i,
    /^\/api\/carta-publica(?:\/|$)/i
];

const internalRoutePatterns = [
    /^\/(?:api\/)?health(?:\/|$)/i,
    /^\/(?:api\/)?worker(?:\/|$)/i,
    /^\/(?:api\/)?metricas(?:\/|$)/i,
    /^\/(?:api\/)?metrics(?:\/|$)/i,
    /^\/carta-publica\/imagenes\/\d+$/i
];

const normalizePath = (path = '') => {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
};

const getRequestPath = (req) => normalizePath(req.originalUrl || req.path || req.url || '/').split('?')[0];

const isPublicApiPath = (path = '') => {
    const normalizedPath = normalizePath(path);
    return publicRoutePatterns.some((pattern) => pattern.test(normalizedPath));
};

const isInternalAutoPath = (path = '') => {
    const normalizedPath = normalizePath(path);
    return internalRoutePatterns.some((pattern) => pattern.test(normalizedPath));
};

const hasStaffBearerToken = (req) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
};

const getClientIp = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }

    const rawIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    if (!rawIp) return 'unknown';
    return rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
};

const applyRateLimitHeaders = (res, maxRequests, remaining, resetTime, includeRetryAfter = false) => {
    const resetSeconds = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000));
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (includeRetryAfter) {
        res.setHeader('Retry-After', String(resetSeconds));
    }
};

const getEffectiveType = (requestedType, req) => {
    const requestPath = getRequestPath(req);

    if (requestedType === 'internal') {
        return 'internal';
    }

    if (requestedType === 'login') {
        return 'login';
    }

    if (isInternalAutoPath(requestPath)) {
        return 'internal';
    }

    if (isPublicApiPath(requestPath)) {
        return 'public';
    }

    if (requestedType === 'strict') {
        return 'strict';
    }

    return 'public';
};

const shouldBypassStaffRateLimit = (req) => {
    const requestPath = getRequestPath(req);
    return hasStaffBearerToken(req) && !isPublicApiPath(requestPath) && !isInternalAutoPath(requestPath);
};

const getEffectiveConfig = (type) => rateLimitConfigs[type] || rateLimitConfigs.public;

const cleanExpiredRecords = () => {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
        if (now > data.resetTime) {
            requestCounts.delete(key);
        }
    }
};

const cleanupInterval = setInterval(cleanExpiredRecords, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

/**
 * Middleware de rate limiting
 * @param {string} type - Tipo de rate limit: 'login', 'api', 'strict', 'internal'
 */
const rateLimiter = (type = 'api') => {
    return (req, res, next) => {
        if (type === 'api' && shouldBypassStaffRateLimit(req)) {
            return next();
        }

        const effectiveType = getEffectiveType(type, req);
        const config = getEffectiveConfig(effectiveType);
        const clientIp = getClientIp(req);

        const identifier = req.user?.id
            ? `user_${req.user.id}`
            : `ip_${clientIp}`;

        const key = `${effectiveType}_${identifier}`;
        const now = Date.now();

        let record = requestCounts.get(key);

        if (!record) {
            record = {
                count: 1,
                resetTime: now + config.windowMs
            };
            requestCounts.set(key, record);

            applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - 1, record.resetTime);
            return next();
        }

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + config.windowMs;
            requestCounts.set(key, record);

            applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - 1, record.resetTime);
            return next();
        }

        record.count++;

        applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - record.count, record.resetTime);

        if (record.count > config.maxRequests) {
            const retryAfter = Math.max(0, Math.ceil((record.resetTime - now) / 1000));
            applyRateLimitHeaders(res, config.maxRequests, 0, record.resetTime, true);

            console.warn(`⚠️ Rate limit excedido para ${identifier} en ${effectiveType}`);

            return res.status(429).json({
                code: 'RATE_LIMIT_EXCEEDED',
                error: config.message,
                retryAfter,
                resetTime: new Date(record.resetTime).toISOString(),
                shouldRetry: true
            });
        }

        next();
    };
};

const loginRateLimiter = rateLimiter('login');
const apiRateLimiter = rateLimiter('api');
const strictRateLimiter = rateLimiter('strict');
const internalRateLimiter = rateLimiter('internal');

module.exports = {
    rateLimiter,
    loginRateLimiter,
    apiRateLimiter,
    strictRateLimiter,
    internalRateLimiter,
    // Exportados para tests
    hasStaffBearerToken,
    isPublicApiPath,
    isInternalAutoPath,
    shouldBypassStaffRateLimit,
    rateLimitConfigs
};
