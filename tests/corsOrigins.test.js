const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAllowedOrigins,
  resolveSocketOrigins,
  isOriginAllowed
} = require('../lib/corsOrigins');

describe('corsOrigins', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('incluye localhost y dominios productivos por defecto', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CARTA_FRONTEND_URL;
    delete process.env.ALLOWED_ORIGINS;

    const origins = resolveAllowedOrigins();
    assert.ok(origins.includes('http://localhost:3000'));
    assert.ok(origins.includes('https://www.elchalito.com'));
    assert.ok(origins.includes('https://www.gestionelchalito.com'));
  });

  it('agrega FRONTEND_URL, CARTA_FRONTEND_URL y ALLOWED_ORIGINS', () => {
    process.env.FRONTEND_URL = 'https://panel-test.example.com';
    process.env.CARTA_FRONTEND_URL = 'https://carta-test.example.com';
    process.env.ALLOWED_ORIGINS = 'https://extra.example.com,https://otro.example.com';

    const origins = resolveAllowedOrigins();
    assert.ok(origins.includes('https://panel-test.example.com'));
    assert.ok(origins.includes('https://carta-test.example.com'));
    assert.ok(origins.includes('https://extra.example.com'));
    assert.ok(origins.includes('https://otro.example.com'));
  });

  it('isOriginAllowed valida contra la lista resuelta', () => {
    process.env.FRONTEND_URL = 'https://panel-test.example.com';
    assert.equal(isOriginAllowed('https://panel-test.example.com'), true);
    assert.equal(isOriginAllowed('https://evil.example.com'), false);
  });

  it('resolveSocketOrigins en development incluye regex localhost', () => {
    process.env.NODE_ENV = 'development';
    const socketOrigins = resolveSocketOrigins();
    assert.ok(socketOrigins.some((origin) => origin instanceof RegExp));
  });
});
