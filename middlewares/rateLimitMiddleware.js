/**
 * Rate Limiting Middleware
 * Protege contra ataques de fuerza bruta y abuso de API
 */

// Almacén en memoria para rate limiting
const requestCounts = new Map();

// Configuración por endpoint
const rateLimitConfigs = {
    login: {
        windowMs: 15 * 60 * 1000, // 15 minutos
        maxRequests: 5, // 5 intentos
        message: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.'
    },
    api: {
        windowMs: 1 * 60 * 1000, // 1 minuto
        maxRequests: 100, // 100 requests
        message: 'Demasiadas peticiones. Intente nuevamente en un minuto.'
    },
    strict: {
        windowMs: 1 * 60 * 1000, // 1 minuto
        maxRequests: 10, // 10 requests
        message: 'Límite de peticiones excedido. Intente nuevamente en un minuto.'
    }
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

// Limpiar cada 5 minutos
setInterval(cleanExpiredRecords, 5 * 60 * 1000);

/**
 * Middleware de rate limiting
 * @param {string} type - Tipo de rate limit: 'login', 'api', 'strict'
 */
const rateLimiter = (type = 'api') => {
    return (req, res, next) => {
        const config = rateLimitConfigs[type] || rateLimitConfigs.api;

        // Identificador único por IP y usuario (si está autenticado)
        const identifier = req.user?.id
            ? `user_${req.user.id}`
            : `ip_${req.ip || req.connection.remoteAddress}`;

        const key = `${type}_${identifier}`;
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

            // Headers informativos
            res.setHeader('X-RateLimit-Limit', config.maxRequests);
            res.setHeader('X-RateLimit-Remaining', config.maxRequests - 1);
            res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

            return next();
        }

        // Verificar si la ventana ha expirado
        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + config.windowMs;
            requestCounts.set(key, record);

            res.setHeader('X-RateLimit-Limit', config.maxRequests);
            res.setHeader('X-RateLimit-Remaining', config.maxRequests - 1);
            res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

            return next();
        }

        // Incrementar contador
        record.count++;

        // Headers informativos
        res.setHeader('X-RateLimit-Limit', config.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - record.count));
        res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

        // Verificar si excedió el límite
        if (record.count > config.maxRequests) {
            const retryAfter = Math.ceil((record.resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfter);

            console.warn(`⚠️ Rate limit excedido para ${identifier} en ${type}`);

            return res.status(429).json({
                error: config.message,
                retryAfter: retryAfter,
                resetTime: new Date(record.resetTime).toISOString()
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

module.exports = {
    rateLimiter,
    loginRateLimiter,
    apiRateLimiter,
    strictRateLimiter
};
