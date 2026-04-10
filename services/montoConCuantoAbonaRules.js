/**
 * Regla de negocio: "Con cuánto paga" en pedidos en EFECTIVO (carta / delivery).
 *
 * Objetivo: permitir pagar con billetes “grandes” habituales (ej. total $14.000 con $50.000)
 * sin aceptar montos claramente incoherentes vía typo o error (ej. total $14.000 con $150.000).
 *
 * Definición:
 * - Mínimo: monto >= total del pedido (el total es calculado en el servidor a partir de precios).
 * - Máximo: total + excesoMáximo, donde
 *        excesoMáximo = max(50_000 ARS, 75% del total redondeado al peso entero más cercano).
 *
 * Ejemplos:
 * - Total $14.000 → máximo $64.000 (14.000 + 50.000).
 * - Total $100.000 → máximo $175.000 (100.000 + max(50.000, 75.000)).
 * - Total $3.000 → máximo $53.000 (sigue cubriendo billete de $20.000).
 */
const EXCESO_MINIMO_ABSOLUTO_ARS = 50_000;
const FRACCION_EXCESO_SOBRE_TOTAL = 0.75;
const EPS_MONTO = 0.01;

function roundMontoArs(n) {
    return Math.round(Number(n) * 100) / 100;
}

function formatMontoMensaje(n) {
    const r = roundMontoArs(n);
    return `$${r.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

function computeMaxMontoConCuantoAbona(totalPedido) {
    const t = roundMontoArs(totalPedido);
    if (!Number.isFinite(t) || t <= 0) return 0;
    const exceso = Math.max(
        EXCESO_MINIMO_ABSOLUTO_ARS,
        Math.round(t * FRACCION_EXCESO_SOBRE_TOTAL)
    );
    return roundMontoArs(t + exceso);
}

/**
 * @param {number|null} monto - Valor parseado de conCuantoAbona / cashGiven
 * @param {number} totalPedido - Total del pedido en servidor
 * @returns {{ ok: true } | { ok: false, code: string, message: string, maxPermitido?: number }}
 */
function validateMontoConCuantoAbonaEfectivo(monto, totalPedido) {
    const total = roundMontoArs(totalPedido);
    if (monto === null || !Number.isFinite(monto)) {
        return {
            ok: false,
            code: 'MONTO_EFECTIVO_INVALIDO',
            message: 'Si el medio de pago es EFECTIVO, debés indicar un monto válido en conCuantoAbona/cashGiven.'
        };
    }
    const m = roundMontoArs(monto);
    if (m <= 0) {
        return {
            ok: false,
            code: 'MONTO_EFECTIVO_INVALIDO',
            message: 'Si el medio de pago es EFECTIVO, debés indicar un monto válido en conCuantoAbona/cashGiven.'
        };
    }
    if (!Number.isFinite(total) || total <= 0) {
        return { ok: true };
    }
    if (m < total - EPS_MONTO) {
        return {
            ok: false,
            code: 'MONTO_EFECTIVO_MENOR_AL_TOTAL',
            message: `El monto con el que pagás en efectivo (${formatMontoMensaje(m)}) no puede ser menor al total del pedido (${formatMontoMensaje(total)}).`
        };
    }
    const maxPermitido = computeMaxMontoConCuantoAbona(total);
    if (m > maxPermitido + EPS_MONTO) {
        return {
            ok: false,
            code: 'MONTO_EFECTIVO_EXCEDE_MAXIMO',
            maxPermitido,
            message: `El monto indicado (${formatMontoMensaje(m)}) es demasiado alto para el total del pedido (${formatMontoMensaje(total)}). Podés ingresar hasta ${formatMontoMensaje(maxPermitido)} (para cubrir billetes grandes). Si tenés una situación particular, contactá al local.`
        };
    }
    return { ok: true };
}

module.exports = {
    EXCESO_MINIMO_ABSOLUTO_ARS,
    FRACCION_EXCESO_SOBRE_TOTAL,
    computeMaxMontoConCuantoAbona,
    validateMontoConCuantoAbonaEfectivo
};
