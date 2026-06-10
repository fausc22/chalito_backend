const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildQualityWarnings,
    normalizeSlide,
    MAX_SLIDES
} = require('../../services/carouselSettingsService');

test('buildQualityWarnings: imagen ideal sin advertencias fuertes', () => {
    const warnings = buildQualityWarnings(1920, 1080);
    assert.equal(warnings.length, 0);
});

test('buildQualityWarnings: resolución baja advierte nitidez', () => {
    const warnings = buildQualityWarnings(1280, 720);
    assert.ok(warnings.some((w) => w.includes('nitidez')));
});

test('buildQualityWarnings: aspect ratio no 16:9 advierte recorte', () => {
    const warnings = buildQualityWarnings(1920, 1920);
    assert.ok(warnings.some((w) => w.includes('16:9')));
});

test('normalizeSlide: aplica defaults de focal y zoom', () => {
    const slide = normalizeSlide({ url: 'https://files.elchalito.com/a.jpg' }, 0);
    assert.equal(slide.focalX, 50);
    assert.equal(slide.focalY, 50);
    assert.equal(slide.zoom, 1);
    assert.equal(slide.position, 0);
});

test('MAX_SLIDES es 10', () => {
    assert.equal(MAX_SLIDES, 10);
});
