/**
 * Servicio de validación y normalización de personalizaciones (extras) para hamburguesas.
 * - Valida que no se combinen "Hacela doble" y "Hacela triple" (por id o por nombre).
 * - Normaliza extras a { id, nombre, precio_extra } y calcula extrasTotal.
 */

const NOMBRES_EXTRAS_INCOMPATIBLES = [
    'Hacela doble',
    'Hacela triple'
];

const normalizarNombre = (s) => (s || '').trim().toLowerCase();

const esExtraIncompatible = (nombre) => {
    if (!nombre || typeof nombre !== 'string') return null;
    const n = normalizarNombre(nombre);
    return NOMBRES_EXTRAS_INCOMPATIBLES.find(
        (inc) => normalizarNombre(inc) === n
    ) || null;
};

/**
 * Valida que los extras no incluyan ambos "Hacela doble" y "Hacela triple".
 * @param {Array} extras - Array de extras con { id?, nombre?, precio?, precio_extra? }
 * @param {Array} [adicionalesPorId] - Opcional: mapa de adicionales por id para resolver nombre desde id
 * @returns {{ valid: boolean, message?: string }}
 */
const validarExtrasNoDobleYTriple = (extras, adicionalesPorId = null) => {
    const arr = Array.isArray(extras) ? extras : [];
    const encontrados = new Set();

    for (const e of arr) {
        let nombre = e?.nombre;
        if (!nombre && e?.id != null && adicionalesPorId) {
            const ad = adicionalesPorId.find((a) => a.id === e.id);
            nombre = ad?.nombre;
        }
        const match = esExtraIncompatible(nombre);
        if (match) encontrados.add(match);
    }

    if (encontrados.size >= 2) {
        return {
            valid: false,
            message: 'No se puede combinar "Hacela doble" con "Hacela triple" en el mismo ítem. Elija solo una opción.'
        };
    }
    return { valid: true };
};

/**
 * Normaliza extras a formato estándar { id, nombre, precio_extra } y calcula extrasTotal.
 * @param {Array} extras - Array de extras en cualquier formato
 * @returns {{ extras: Array<{id, nombre, precio_extra}>, extrasTotal: number }}
 */
const normalizarExtras = (extras) => {
    const arr = Array.isArray(extras) ? extras : [];
    const normalizados = arr.map((e) => ({
        id: e?.id ?? null,
        nombre: e?.nombre ?? (e?.nombre_adicional) ?? '',
        precio_extra: parseFloat(e?.precio_extra ?? e?.precio ?? e?.precio_adicional ?? 0) || 0
    }));
    const extrasTotal = normalizados.reduce((sum, x) => sum + x.precio_extra, 0);
    return { extras: normalizados, extrasTotal };
};

/**
 * Construye personalizaciones normalizadas: { extras, extrasTotal }.
 * Siempre incluye extrasTotal (aunque sea 0).
 */
const construirPersonalizaciones = (extras) => {
    const { extras: extrasNorm, extrasTotal } = normalizarExtras(extras);
    return {
        extras: extrasNorm,
        extrasTotal
    };
};

module.exports = {
    NOMBRES_EXTRAS_INCOMPATIBLES,
    validarExtrasNoDobleYTriple,
    normalizarExtras,
    construirPersonalizaciones
};
