/**
 * Rate Limiting Middleware
 * Protege contra ataques de fuerza bruta y abuso de API
 */

// Almacén en memoria para rate limiting
const requestCounts = new Map();

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

const parseEnvNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Configuración por endpoint
const rateLimitConfigs = {
    login: {
        windowMs: parseEnvNumber(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000), // 15 minutos
        maxRequests: parseEnvNumber(process.env.RATE_LIMIT_LOGIN_MAX, 5), // 5 intentos
        message: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.'
    },
    api: {
        windowMs: parseEnvNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 1 * 60 * 1000), // 1 minuto
        maxRequests: parseEnvNumber(process.env.RATE_LIMIT_API_MAX, isProduction ? 100 : 1000), // 100/min en prod
        message: 'Demasiadas peticiones. Intente nuevamente en un minuto.'
    },
    strict: {
        windowMs: parseEnvNumber(process.env.RATE_LIMIT_STRICT_WINDOW_MS, 1 * 60 * 1000), // 1 minuto
        maxRequests: parseEnvNumber(process.env.RATE_LIMIT_STRICT_MAX, 10), // 10 requests
        message: 'Límite de peticiones excedido. Intente nuevamente en un minuto.'
    },
    internal: {
        windowMs: parseEnvNumber(process.env.RATE_LIMIT_INTERNAL_WINDOW_MS, 1 * 60 * 1000),
        maxRequests: parseEnvNumber(process.env.RATE_LIMIT_INTERNAL_MAX, isProduction ? 2000 : 10000),
        message: 'Demasiadas peticiones internas.'
    }
};

const localhostDevMax = parseEnvNumber(process.env.RATE_LIMIT_DEV_LOCALHOST_MAX, 10000);
const internalRoutePatterns = [
    /^\/(?:api\/)?health(?:\/|$)/i,
    /^\/(?:api\/)?worker(?:\/|$)/i,
    /^\/(?:api\/)?metricas(?:\/|$)/i,
    /^\/(?:api\/)?metrics(?:\/|$)/i,
    /^\/carta-publica\/imagenes\/\d+$/i  // Proxy de imágenes (cache fuerte, más requests esperados)
];

const normalizePath = (path = '') => {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
};

const isInternalPath = (path = '') => {
    const normalizedPath = normalizePath(path);
    return internalRoutePatterns.some((pattern) => pattern.test(normalizedPath));
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

const isLocalIp = (ip = '') => {
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
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
    if (requestedType === 'api' && isInternalPath(req.originalUrl || req.path || req.url)) {
        return 'internal';
    }

    return requestedType;
};

const getEffectiveConfig = (type, req) => {
    const baseConfig = rateLimitConfigs[type] || rateLimitConfigs.api;
    const clientIp = getClientIp(req);

    if (isDevelopment && isLocalIp(clientIp)) {
        return {
            ...baseConfig,
            maxRequests: Math.max(baseConfig.maxRequests, localhostDevMax)
        };
    }

    return baseConfig;
};

/**
 * Limpia los registros expirados
 */
const cleanExpiredRecords = () => {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
        if (now > data.resetTime) {
            requestCounts.delete(key);
        }
    }
};

// Limpiar cada 5 minutos sin bloquear cierre del proceso
const cleanupInterval = setInterval(cleanExpiredRecords, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

/**
 * Middleware de rate limiting
 * @param {string} type - Tipo de rate limit: 'login', 'api', 'strict'
 */
const rateLimiter = (type = 'api') => {
    return (req, res, next) => {
        const effectiveType = getEffectiveType(type, req);
        const config = getEffectiveConfig(effectiveType, req);
        const clientIp = getClientIp(req);

        // Identificador único por IP y usuario (si está autenticado)
        const identifier = req.user?.id
            ? `user_${req.user.id}`
            : `ip_${clientIp}`;

        const key = `${effectiveType}_${identifier}`;
        const now = Date.now();

        // Obtener o crear registro
        let record = requestCounts.get(key);

        if (!record) {
            // Primera request en esta ventana
            record = {
                count: 1,
                resetTime: now + config.windowMs
            };
            requestCounts.set(key, record);

            applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - 1, record.resetTime);

            return next();
        }

        // Verificar si la ventana ha expirado
        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + config.windowMs;
            requestCounts.set(key, record);

            applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - 1, record.resetTime);

            return next();
        }

        // Incrementar contador
        record.count++;

        applyRateLimitHeaders(res, config.maxRequests, config.maxRequests - record.count, record.resetTime);

        // Verificar si excedió el límite
        if (record.count > config.maxRequests) {
            const retryAfter = Math.max(0, Math.ceil((record.resetTime - now) / 1000));
            applyRateLimitHeaders(res, config.maxRequests, 0, record.resetTime, true);

            console.warn(`⚠️ Rate limit excedido para ${identifier} en ${effectiveType}`);

            return res.status(429).json({
                code: 'RATE_LIMIT_EXCEEDED',
                error: config.message,
                retryAfter: retryAfter,
                resetTime: new Date(record.resetTime).toISOString(),
                shouldRetry: true
            });
        }

        next();
    };
};

/**
 * Rate limiters preconfigurados
 */
const loginRateLimiter = rateLimiter('login');
const apiRateLimiter = rateLimiter('api');
const strictRateLimiter = rateLimiter('strict');
const internalRateLimiter = rateLimiter('internal');

module.exports = {
    rateLimiter,
    loginRateLimiter,
    apiRateLimiter,
    strictRateLimiter,
    internalRateLimiter
};
