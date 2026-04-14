const IVA_RATE = 1.21;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toSafeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

function calcularTotalesDesdePrecioFinal(totalFinal) {
    const total = round2(Math.max(0, toSafeNumber(totalFinal)));
    const subtotal = round2(total / IVA_RATE);
    const iva_total = round2(total - subtotal);

    return {
        subtotal,
        iva_total,
        total
    };
}

function obtenerTotalFinalDesdeRegistro(registro = {}) {
    const total = Number(registro?.total);
    if (Number.isFinite(total)) return total;

    const subtotal = Number(registro?.subtotal);
    if (Number.isFinite(subtotal)) return subtotal;

    return 0;
}

function calcularTotalesConDescuentoPorcentaje(totalOriginal, descuentoPorcentaje = 0) {
    const totalBase = round2(Math.max(0, toSafeNumber(totalOriginal)));
    const porcentaje = Math.max(0, Math.min(100, toSafeNumber(descuentoPorcentaje)));
    const descuento = round2(totalBase * (porcentaje / 100));
    const totalFinal = round2(totalBase - descuento);
    const { subtotal, iva_total, total } = calcularTotalesDesdePrecioFinal(totalFinal);

    return {
        descuento_porcentaje: porcentaje,
        descuento,
        subtotal,
        iva_total,
        total
    };
}

module.exports = {
    calcularTotalesDesdePrecioFinal,
    obtenerTotalFinalDesdeRegistro,
    calcularTotalesConDescuentoPorcentaje
};
