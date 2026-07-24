/**
 * Servicio de validación y normalización de personalizaciones (extras) para hamburguesas.
 * - Valida que no se combinen "Hacela doble" y "Hacela triple" (por id o por nombre).
 * - Normaliza extras a { id, nombre, precio_extra, cantidad? } y calcula extrasTotal.
 */

const CANTIDAD_EXTRA_MAXIMA = 99;

const NOMBRES_EXTRAS_INCOMPATIBLES = [
    'Hacela doble',
    'Hacela triple'
];

const PRESENTACIONES_VALIDAS = new Set(['SIMPLE', 'DOBLE', 'TRIPLE', 'CUADRUPLE']);

/** Normaliza nombre de extra para comparar presentación (sin acentos). */
const normalizarNombrePresentacion = (n) =>
    String(n || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

/**
 * Detecta extras de presentación.
 * Acepta "Hacela doble" y también el label corto "Doble"/"DOBLE".
 * No matchea extras tipo "Extra queso doble".
 */
const ES_HACELA_DOBLE = (n) => {
    const s = normalizarNombrePresentacion(n);
    return s === 'doble' || /hacela\s*doble/.test(s);
};
const ES_HACELA_TRIPLE = (n) => {
    const s = normalizarNombrePresentacion(n);
    return s === 'triple' || /hacela\s*triple/.test(s);
};
const ES_HACELA_CUADRUPLE = (n) => {
    const s = normalizarNombrePresentacion(n);
    return s === 'cuadruple' || /hacela\s*cuadruple/.test(s);
};

const esExtraDePresentacion = (nombre) =>
    ES_HACELA_DOBLE(nombre) || ES_HACELA_TRIPLE(nombre) || ES_HACELA_CUADRUPLE(nombre);

const extraNombre = (extra) => String(extra?.nombre ?? extra?.nombre_adicional ?? '').trim();

const inferirPresentacionDesdeExtras = (extras = []) => {
    const arr = Array.isArray(extras) ? extras : [];
    for (const extra of arr) {
        const nombre = extraNombre(extra);
        if (ES_HACELA_CUADRUPLE(nombre)) return 'CUADRUPLE';
        if (ES_HACELA_TRIPLE(nombre)) return 'TRIPLE';
        if (ES_HACELA_DOBLE(nombre)) return 'DOBLE';
    }
    return null;
};

const esArticuloConPresentacion = ({ categoriaNombre, articuloNombre } = {}) => {
    const categoria = String(categoriaNombre ?? '').trim().toLowerCase();
    if (
        categoria.includes('hamburguesa') ||
        categoria.includes('sandwich') ||
        categoria.includes('sándwich') ||
        categoria.includes('lomo')
    ) {
        return true;
    }

    const nombre = String(articuloNombre ?? '').trim().toLowerCase();
    return (
        nombre.includes('hambur') ||
        nombre.includes('burger') ||
        nombre.includes('lomo') ||
        nombre.includes('sandwich') ||
        nombre.includes('sándwich')
    );
};

const parsePersonalizacionesObjeto = (personalizaciones) => {
    if (!personalizaciones) return null;
    if (typeof personalizaciones === 'string') {
        try {
            return JSON.parse(personalizaciones);
        } catch (_) {
            return null;
        }
    }
    return typeof personalizaciones === 'object' ? personalizaciones : null;
};

/**
 * Resuelve la presentación para cocina/impresión (SIMPLE, DOBLE, TRIPLE, CUADRUPLE o null).
 * Prioridad: extras reales > campo presentacion explícito > SIMPLE por tipo de artículo.
 * Así un extra "doble" gana aunque presentacion haya quedado mal en 'SIMPLE'.
 */
const resolverPresentacionParaCocina = (personalizaciones, articuloNombre, categoriaNombre) => {
    if (Array.isArray(personalizaciones)) {
        const desdeExtras = inferirPresentacionDesdeExtras(personalizaciones);
        if (desdeExtras) return desdeExtras;
        if (esArticuloConPresentacion({ categoriaNombre, articuloNombre })) {
            return 'SIMPLE';
        }
        return null;
    }

    const pers = parsePersonalizacionesObjeto(personalizaciones);
    const extras = Array.isArray(pers?.extras) ? pers.extras : [];
    const desdeExtras = inferirPresentacionDesdeExtras(extras);
    if (desdeExtras) return desdeExtras;

    const explicita = String(pers?.presentacion || '').trim().toUpperCase();
    if (PRESENTACIONES_VALIDAS.has(explicita)) return explicita;

    if (esArticuloConPresentacion({ categoriaNombre, articuloNombre })) {
        return 'SIMPLE';
    }

    return null;
};

const crearErrorExtras = (message, code) => {
    const err = new Error(message);
    err.code = code;
    return err;
};

/**
 * Parsea y valida cantidad de un extra (1..CANTIDAD_EXTRA_MAXIMA).
 * @param {*} raw
 * @param {string} [fieldLabel]
 * @returns {number}
 */
const parsearCantidadExtra = (raw, fieldLabel = 'cantidad') => {
    if (raw === undefined || raw === null) {
        return 1;
    }

    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(n)) {
        throw crearErrorExtras(`${fieldLabel} debe ser un número entero positivo`, 'EXTRA_CANTIDAD_INVALIDA');
    }
    if (n < 1) {
        throw crearErrorExtras(`${fieldLabel} debe ser al menos 1`, 'EXTRA_CANTIDAD_INVALIDA');
    }
    if (n > CANTIDAD_EXTRA_MAXIMA) {
        throw crearErrorExtras(`${fieldLabel} no puede superar ${CANTIDAD_EXTRA_MAXIMA}`, 'EXTRA_CANTIDAD_INVALIDA');
    }
    return n;
};

/**
 * Obtiene cantidad efectiva de un extra según flag permite_cantidad del catálogo.
 * @param {number} cantidadSolicitada
 * @param {*} permiteCantidad
 * @returns {number}
 */
const aplicarCantidadEfectivaExtra = (cantidadSolicitada, permiteCantidad) => {
    const permite = permiteCantidad === true || permiteCantidad === 1 || permiteCantidad === '1';
    if (!permite) {
        return 1;
    }
    return Math.min(CANTIDAD_EXTRA_MAXIMA, Math.max(1, cantidadSolicitada));
};

/**
 * Consolida entradas duplicadas por id sumando cantidades.
 * @param {Array<{id: number, cantidad: number}>} extras
 * @returns {Array<{id: number, cantidad: number}>}
 */
const consolidarExtrasPorId = (extras = []) => {
    const map = new Map();
    for (const entry of extras) {
        const id = entry?.id;
        const cantidad = entry?.cantidad ?? 1;
        if (map.has(id)) {
            map.set(id, map.get(id) + cantidad);
        } else {
            map.set(id, cantidad);
        }
    }
    return [...map.entries()].map(([id, cantidad]) => ({ id, cantidad }));
};

/**
 * Normaliza extras del payload (legacy number[] o nuevo { id, cantidad? }[]).
 * @param {Array<number|object>} rawExtras
 * @returns {Array<{id: number, cantidad: number}>}
 */
const parsearExtrasDelPayload = (rawExtras) => {
    if (rawExtras == null) {
        return [];
    }
    if (!Array.isArray(rawExtras)) {
        throw crearErrorExtras('selectedExtras/extras debe ser un array', 'EXTRAS_FORMATO_INVALIDO');
    }

    const parsed = rawExtras.map((entry, index) => {
        if (typeof entry === 'number' || (typeof entry === 'string' && String(entry).trim() !== '')) {
            const id = Number(entry);
            if (!Number.isInteger(id) || id <= 0) {
                throw crearErrorExtras(`Extra en posición ${index}: id inválido`, 'EXTRA_ID_INVALIDO');
            }
            return { id, cantidad: 1 };
        }

        if (typeof entry === 'object' && entry != null) {
            const id = Number(entry.id);
            if (!Number.isInteger(id) || id <= 0) {
                throw crearErrorExtras(`Extra en posición ${index}: id inválido`, 'EXTRA_ID_INVALIDO');
            }
            const cantidad = parsearCantidadExtra(entry.cantidad, `cantidad del extra ${id}`);
            return { id, cantidad };
        }

        throw crearErrorExtras(`Extra en posición ${index}: formato inválido`, 'EXTRAS_FORMATO_INVALIDO');
    });

    return consolidarExtrasPorId(parsed);
};

/**
 * Valida que los extras no incluyan más de una presentación (doble/triple/cuadruple).
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
        const tipo = inferirPresentacionDesdeExtras([{ nombre }]);
        if (tipo) encontrados.add(tipo);
    }

    if (encontrados.size >= 2) {
        return {
            valid: false,
            message: 'No se puede combinar "Hacela doble" con "Hacela triple" en el mismo ítem. Elija solo una opción.'
        };
    }
    return { valid: true };
};

const obtenerCantidadExtra = (extra) => Math.max(1, parseInt(extra?.cantidad, 10) || 1);

/**
 * Normaliza extras a formato estándar { id, nombre, precio_extra, cantidad? } y calcula extrasTotal.
 * @param {Array} extras - Array de extras en cualquier formato
 * @returns {{ extras: Array<{id, nombre, precio_extra, cantidad?}>, extrasTotal: number }}
 */
const normalizarExtras = (extras) => {
    const arr = Array.isArray(extras) ? extras : [];
    const normalizados = arr.map((e) => {
        const cantidad = obtenerCantidadExtra(e);
        const precio_extra = parseFloat(e?.precio_extra ?? e?.precio ?? e?.precio_adicional ?? 0) || 0;
        const entry = {
            id: e?.id ?? null,
            nombre: e?.nombre ?? (e?.nombre_adicional) ?? '',
            precio_extra
        };
        if (cantidad > 1) {
            entry.cantidad = cantidad;
        }
        return entry;
    });
    const extrasTotal = normalizados.reduce(
        (sum, x) => sum + x.precio_extra * obtenerCantidadExtra(x),
        0
    );
    return { extras: normalizados, extrasTotal };
};

/**
 * Construye snapshot de extras a partir de filas DB y cantidades solicitadas.
 * @param {Array} adicionalesRows - Filas de adicionales desde DB
 * @param {Array<{id: number, cantidad: number}>} extrasParsed
 * @returns {{ extrasSnapshot: Array, extrasTotal: number }}
 */
const construirSnapshotExtrasDesdeDb = (adicionalesRows, extrasParsed) => {
    const ids = extrasParsed.map((e) => e.id);
    const rowById = new Map(adicionalesRows.map((r) => [r.id, r]));

    if (adicionalesRows.length !== ids.length) {
        throw crearErrorExtras('Uno o más adicionales no son válidos para el artículo', 'EXTRAS_INVALIDOS');
    }

    const extrasSnapshot = extrasParsed.map(({ id, cantidad: cantidadSolicitada }) => {
        const row = rowById.get(id);
        const cantidadEfectiva = aplicarCantidadEfectivaExtra(cantidadSolicitada, row.permite_cantidad);
        const precio_extra = parseFloat(row.precio_extra) || 0;
        const entry = {
            id: row.id,
            nombre: row.nombre,
            precio_extra
        };
        if (cantidadEfectiva > 1) {
            entry.cantidad = cantidadEfectiva;
        }
        return entry;
    });

    const validacion = validarExtrasNoDobleYTriple(extrasSnapshot);
    if (!validacion.valid) {
        const err = new Error(validacion.message);
        err.code = 'EXTRAS_DOBLE_TRIPLE_INCOMPATIBLES';
        throw err;
    }

    const extrasTotal = extrasSnapshot.reduce(
        (sum, e) => sum + e.precio_extra * obtenerCantidadExtra(e),
        0
    );

    return { extrasSnapshot, extrasTotal };
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

/**
 * Construye personalizaciones con presentación explícita cuando corresponde.
 * Para hamburguesas/sándwiches sin "Hacela doble/triple/cuadruple", guarda presentacion: 'SIMPLE'.
 */
const construirPersonalizacionesParaArticulo = (extras, { categoriaNombre, articuloNombre } = {}) => {
    const { extras: extrasNorm, extrasTotal } = normalizarExtras(extras);
    const presentacionDesdeExtras = inferirPresentacionDesdeExtras(extrasNorm);

    let presentacion = presentacionDesdeExtras;
    if (!presentacion && esArticuloConPresentacion({ categoriaNombre, articuloNombre })) {
        presentacion = 'SIMPLE';
    }

    if (extrasNorm.length === 0 && !presentacion) {
        return null;
    }

    const result = {
        extras: extrasNorm,
        extrasTotal
    };

    if (presentacion) {
        result.presentacion = presentacion;
    }

    return result;
};

module.exports = {
    CANTIDAD_EXTRA_MAXIMA,
    NOMBRES_EXTRAS_INCOMPATIBLES,
    PRESENTACIONES_VALIDAS,
    ES_HACELA_DOBLE,
    ES_HACELA_TRIPLE,
    ES_HACELA_CUADRUPLE,
    esExtraDePresentacion,
    inferirPresentacionDesdeExtras,
    esArticuloConPresentacion,
    resolverPresentacionParaCocina,
    parsePersonalizacionesObjeto,
    validarExtrasNoDobleYTriple,
    parsearCantidadExtra,
    parsearExtrasDelPayload,
    consolidarExtrasPorId,
    aplicarCantidadEfectivaExtra,
    construirSnapshotExtrasDesdeDb,
    obtenerCantidadExtra,
    normalizarExtras,
    construirPersonalizaciones,
    construirPersonalizacionesParaArticulo
};
