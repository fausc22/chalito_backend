const express = require('express');
const request = require('supertest');

const buildApp = (middleware, path = '/test') => {
    const app = express();
    app.get(path, middleware, (_req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
};

const buildPostApp = (middleware, path = '/test') => {
    const app = express();
    app.post(path, middleware, (_req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
};

const loadMiddleware = () => {
    jest.resetModules();
    return require('../../middlewares/rateLimitMiddleware');
};

describe('rateLimitMiddleware', () => {
    it('aplica límite public (120/min) en rutas API sin Bearer', async () => {
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/articulos');

        const response = await request(app).get('/articulos');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('120');
        expect(response.headers['x-ratelimit-remaining']).toBe('119');
    });

    it('omite rate limit para staff autenticado con Bearer en rutas internas', async () => {
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/articulos');

        for (let i = 0; i < 150; i++) {
            const response = await request(app)
                .get('/articulos')
                .set('Authorization', 'Bearer fake-token');
            expect(response.status).toBe(200);
        }
    });

    it('aplica perfil internal (300/min) en health/metrics aunque haya Bearer', async () => {
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/health/worker');

        const response = await request(app)
            .get('/health/worker')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('300');
    });

    it('responde 429 con headers estándar cuando se supera el límite public', async () => {
        const { apiRateLimiter, rateLimitConfigs } = loadMiddleware();
        rateLimitConfigs.public.maxRequests = 2;
        const app = buildApp(apiRateLimiter, '/ventas');

        await request(app).get('/ventas');
        await request(app).get('/ventas');
        const blockedResponse = await request(app).get('/ventas');

        expect(blockedResponse.status).toBe(429);
        expect(blockedResponse.headers['retry-after']).toBeDefined();
        expect(blockedResponse.headers['x-ratelimit-limit']).toBe('2');
        expect(blockedResponse.headers['x-ratelimit-remaining']).toBe('0');
        expect(blockedResponse.body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(blockedResponse.body.shouldRetry).toBe(true);
    });

    it('bloquea login tras superar el límite de intentos', async () => {
        const { loginRateLimiter, rateLimitConfigs } = loadMiddleware();
        rateLimitConfigs.login.maxRequests = 3;
        const app = buildPostApp(loginRateLimiter, '/auth/login');

        await request(app).post('/auth/login').send({});
        await request(app).post('/auth/login').send({});
        await request(app).post('/auth/login').send({});
        const blockedResponse = await request(app).post('/auth/login').send({});

        expect(blockedResponse.status).toBe(429);
        expect(blockedResponse.body.error).toContain('Demasiados intentos de inicio de sesión');
    });

    it('aplica límite public en carta-publica aunque haya Bearer', async () => {
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/carta-publica/articulos');

        const response = await request(app)
            .get('/carta-publica/articulos')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('120');
    });

    it('internalRateLimiter usa perfil internal directamente', async () => {
        const { internalRateLimiter } = loadMiddleware();
        const app = buildApp(internalRateLimiter, '/metrics/pedidos-atrasados');

        const response = await request(app).get('/metrics/pedidos-atrasados');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('300');
    });
});
