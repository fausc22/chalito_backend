const TIPOS_ARTICULO_CONTROLA_STOCK = Object.freeze({
    ELABORADO: false,
    BEBIDA: true,
    OTRO: true
});

const normalizarTipoArticulo = (tipo) => {
    if (typeof tipo !== 'string') return 'OTRO';
    const tipoNormalizado = tipo.trim().toUpperCase();
    if (!tipoNormalizado) return 'OTRO';
    return tipoNormalizado;
};

const defaultControlaStockPorTipo = (tipo) => {
    const tipoNormalizado = normalizarTipoArticulo(tipo);
    if (Object.prototype.hasOwnProperty.call(TIPOS_ARTICULO_CONTROLA_STOCK, tipoNormalizado)) {
        return TIPOS_ARTICULO_CONTROLA_STOCK[tipoNormalizado];
    }
    return true;
};

const parseBooleanFlexible = (value) => {
    if (value === undefined) return { valido: true, valor: undefined };
    if (value === null) return { valido: false, mensaje: 'controla_stock debe ser booleano' };
    if (typeof value === 'boolean') return { valido: true, valor: value };
    if (typeof value === 'number') {
        if (value === 1) return { valido: true, valor: true };
        if (value === 0) return { valido: true, valor: false };
    }
    if (typeof value === 'string') {
        const normalizado = value.trim().toLowerCase();
        if (normalizado === 'true' || normalizado === '1') return { valido: true, valor: true };
        if (normalizado === 'false' || normalizado === '0') return { valido: true, valor: false };
    }
    return { valido: false, mensaje: 'controla_stock debe ser booleano' };
};

module.exports = {
    TIPOS_ARTICULO_CONTROLA_STOCK,
    normalizarTipoArticulo,
    defaultControlaStockPorTipo,
    parseBooleanFlexible
};
