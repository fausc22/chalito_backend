const crypto = require('crypto');
const { deleteImageFromFileServer } = require('../config/fileStorage');

function getDb() {
    return require('../controllers/dbPromise');
}

const CONFIG_KEY = 'TIENDA_HERO_CAROUSEL';
const MAX_SLIDES = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 1.35;
const IDEAL_WIDTH = 1920;
const IDEAL_HEIGHT = 1080;
const MIN_WIDTH = 1600;
const MIN_HEIGHT = 900;
const TARGET_ASPECT = 16 / 9;
const ASPECT_TOLERANCE = 0.08;

const CACHE_TTL_MS = 30_000;
let cache = null;
let cacheAt = 0;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const buildQualityWarnings = (width, height) => {
    const warnings = [];
    const w = parseNumber(width, 0);
    const h = parseNumber(height, 0);

    if (w <= 0 || h <= 0) {
        warnings.push('No se pudo detectar resolución. Se aplicará recorte automático.');
        return warnings;
    }

    if (w < MIN_WIDTH || h < MIN_HEIGHT) {
        warnings.push('Resolución baja: puede perder nitidez en pantallas grandes.');
    }

    const aspectRatio = w / h;
    if (Math.abs(aspectRatio - TARGET_ASPECT) > ASPECT_TOLERANCE) {
        warnings.push('Proporción distinta a 16:9: se aplicará recorte automático.');
    }

    if (w >= IDEAL_WIDTH && h >= IDEAL_HEIGHT && Math.abs(aspectRatio - TARGET_ASPECT) <= ASPECT_TOLERANCE) {
        return warnings;
    }

    if (warnings.length === 0) {
        warnings.push('Imagen aceptable. Para mejor resultado use 1920x1080 (16:9).');
    }

    return warnings;
};

const normalizeSlide = (slide, index = 0) => {
    const width = parseNumber(slide?.qualityMeta?.width ?? slide?.width, 0);
    const height = parseNumber(slide?.qualityMeta?.height ?? slide?.height, 0);
    const aspectRatio = width > 0 && height > 0 ? Number((width / height).toFixed(4)) : null;
    const warnings = Array.isArray(slide?.qualityMeta?.warnings)
        ? slide.qualityMeta.warnings
        : buildQualityWarnings(width, height);

    return {
        id: slide?.id || crypto.randomUUID(),
        url: String(slide?.url || '').trim(),
        publicId: slide?.publicId ? String(slide.publicId) : null,
        alt: String(slide?.alt || `Slide ${index + 1}`).trim().slice(0, 120),
        position: index,
        enabled: slide?.enabled !== false && slide?.enabled !== 0,
        focalX: clamp(parseNumber(slide?.focalX, 50), 0, 100),
        focalY: clamp(parseNumber(slide?.focalY, 50), 0, 100),
        zoom: clamp(parseNumber(slide?.zoom, 1), MIN_ZOOM, MAX_ZOOM),
        qualityMeta: {
            width: width || null,
            height: height || null,
            aspectRatio,
            warnings
        }
    };
};

const normalizeCarousel = (raw = {}) => {
    const slides = Array.isArray(raw.slides) ? raw.slides : [];
    const normalizedSlides = slides
        .map((slide, index) => normalizeSlide(slide, index))
        .filter((slide) => slide.url)
        .slice(0, MAX_SLIDES)
        .map((slide, index) => ({ ...slide, position: index }));

    return {
        enabled: raw.enabled !== false && raw.enabled !== 0,
        slides: normalizedSlides,
        updatedAt: raw.updatedAt || new Date().toISOString()
    };
};

const getDefaultCarousel = () => ({
    enabled: true,
    slides: [],
    updatedAt: null
});

const fetchRawCarousel = async () => {
    const [rows] = await getDb().execute(
        'SELECT valor FROM configuracion_sistema WHERE clave = ? LIMIT 1',
        [CONFIG_KEY]
    );

    if (!rows.length || !rows[0].valor) {
        return getDefaultCarousel();
    }

    try {
        const parsed = JSON.parse(rows[0].valor);
        return normalizeCarousel(parsed);
    } catch (error) {
        console.error('Error parseando TIENDA_HERO_CAROUSEL:', error.message);
        return getDefaultCarousel();
    }
};

const saveRawCarousel = async (carousel) => {
    const normalized = normalizeCarousel({
        ...carousel,
        updatedAt: new Date().toISOString()
    });

    const payload = JSON.stringify(normalized);
    const [existing] = await getDb().execute(
        'SELECT clave FROM configuracion_sistema WHERE clave = ? LIMIT 1',
        [CONFIG_KEY]
    );

    if (existing.length === 0) {
        await getDb().execute(
            `INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
             VALUES (?, ?, 'JSON', 'Carrusel hero del inicio de la tienda web (carrito)')`,
            [CONFIG_KEY, payload]
        );
    } else {
        await getDb().execute(
            'UPDATE configuracion_sistema SET valor = ?, tipo = ? WHERE clave = ?',
            [payload, 'JSON', CONFIG_KEY]
        );
    }

    invalidateCache();
    return normalized;
};

const invalidateCache = () => {
    cache = null;
    cacheAt = 0;
    try {
        require('./brandingSettingsService').invalidateCache();
    } catch (_) {
        /* noop */
    }
};

const getCarousel = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && cache && now - cacheAt < CACHE_TTL_MS) {
        return JSON.parse(JSON.stringify(cache));
    }

    const carousel = await fetchRawCarousel();
    cache = carousel;
    cacheAt = now;
    return JSON.parse(JSON.stringify(carousel));
};

const getPublicCarousel = async () => {
    const carousel = await getCarousel();
    const slides = (carousel.slides || [])
        .filter((slide) => slide.enabled !== false)
        .sort((a, b) => a.position - b.position)
        .map((slide) => ({
            src: slide.url,
            alt: slide.alt,
            focalX: slide.focalX,
            focalY: slide.focalY,
            zoom: slide.zoom
        }));

    return {
        enabled: carousel.enabled !== false,
        slides,
        updatedAt: carousel.updatedAt
    };
};

const updateCarousel = async ({ enabled, slides }) => {
    const current = await getCarousel({ force: true });
    const nextSlides = slides !== undefined ? slides : current.slides;

    if (Array.isArray(nextSlides) && nextSlides.length > MAX_SLIDES) {
        const error = new Error(`Máximo ${MAX_SLIDES} slides permitidos`);
        error.status = 400;
        throw error;
    }

    return saveRawCarousel({
        enabled: enabled !== undefined ? enabled : current.enabled,
        slides: nextSlides
    });
};

const addSlide = async ({
    url,
    publicId,
    alt,
    width,
    height,
    focalX,
    focalY,
    zoom
}) => {
    const current = await getCarousel({ force: true });
    if (current.slides.length >= MAX_SLIDES) {
        const error = new Error(`Máximo ${MAX_SLIDES} slides permitidos`);
        error.status = 400;
        throw error;
    }

    const slide = normalizeSlide({
        id: crypto.randomUUID(),
        url,
        publicId,
        alt,
        enabled: true,
        focalX,
        focalY,
        zoom,
        qualityMeta: {
            width: parseNumber(width, null),
            height: parseNumber(height, null),
            aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
            warnings: buildQualityWarnings(width, height)
        }
    }, current.slides.length);

    return saveRawCarousel({
        enabled: current.enabled,
        slides: [...current.slides, slide]
    });
};

const deleteSlide = async (slideId) => {
    const current = await getCarousel({ force: true });
    const target = current.slides.find((slide) => slide.id === slideId);

    if (!target) {
        const error = new Error('Slide no encontrado');
        error.status = 404;
        throw error;
    }

    if (target.publicId) {
        await deleteImageFromFileServer(target.publicId);
    }

    const remaining = current.slides
        .filter((slide) => slide.id !== slideId)
        .map((slide, index) => ({ ...slide, position: index }));

    return saveRawCarousel({
        enabled: current.enabled,
        slides: remaining
    });
};

module.exports = {
    CONFIG_KEY,
    MAX_SLIDES,
    MIN_ZOOM,
    MAX_ZOOM,
    buildQualityWarnings,
    normalizeSlide,
    getCarousel,
    getPublicCarousel,
    updateCarousel,
    addSlide,
    deleteSlide,
    invalidateCache
};
