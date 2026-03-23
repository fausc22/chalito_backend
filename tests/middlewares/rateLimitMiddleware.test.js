const express = require('express');
const request = require('supertest');

const buildApp = (middleware, path = '/test') => {
    const app = express();
    app.get(path, middleware, (_req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
};

const loadMiddleware = () => {
    jest.resetModules();
    return require('../../middlewares/rateLimitMiddleware');
};

describe('rateLimitMiddleware', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.RATE_LIMIT_API_MAX;
        delete process.env.RATE_LIMIT_DEV_LOCALHOST_MAX;
        delete process.env.RATE_LIMIT_INTERNAL_MAX;
        delete process.env.RATE_LIMIT_API_WINDOW_MS;
        delete process.env.RATE_LIMIT_INTERNAL_WINDOW_MS;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('usa 100 req/min por defecto en rutas API en producción', async () => {
        process.env.NODE_ENV = 'production';
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/pedidos');

        const response = await request(app).get('/pedidos');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('100');
        expect(response.headers['x-ratelimit-remaining']).toBe('99');
    });

    it('aplica perfil interno alto en health/metrics para evitar throttling agresivo', async () => {
        process.env.NODE_ENV = 'production';
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/health/worker');

        const response = await request(app).get('/health/worker');

        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBe('2000');
    });

    it('responde 429 con headers estándar cuando se supera el límite', async () => {
        process.env.NODE_ENV = 'production';
        process.env.RATE_LIMIT_API_MAX = '2';
        process.env.RATE_LIMIT_API_WINDOW_MS = '60000';
        const { apiRateLimiter } = loadMiddleware();
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

    it('relaja límite para localhost en desarrollo', async () => {
        process.env.NODE_ENV = 'development';
        process.env.RATE_LIMIT_API_MAX = '2';
        process.env.RATE_LIMIT_DEV_LOCALHOST_MAX = '50';
        const { apiRateLimiter } = loadMiddleware();
        const app = buildApp(apiRateLimiter, '/articulos');

        for (let i = 0; i < 10; i++) {
            const response = await request(app)
                .get('/articulos')
                .set('x-forwarded-for', '127.0.0.1');
            expect(response.status).toBe(200);
        }
    });
});
