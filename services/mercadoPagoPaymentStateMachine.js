/**
 * Reglas canónicas de transición para pagos Mercado Pago.
 *
 * Invariantes:
 * - Un pago `approved` válido siempre prevalece sobre rechazos/cancelaciones previos.
 * - La sesión solo pasa a PROCESADO cuando existe pedido creado por aprobación.
 * - Rechazos/cancelaciones no cierran la sesión prematuramente (queda reconciliable).
 * - EXPIRADO solo bloquea transiciones no aprobadas.
 */

const ESTADO_SESION_PENDIENTE = 'PENDIENTE';
const ESTADO_SESION_PROCESADO = 'PROCESADO';
const ESTADO_SESION_CANCELADO = 'CANCELADO';
const ESTADO_SESION_EXPIRADO = 'EXPIRADO';

const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';
const ESTADO_PAGO_PAGADO = 'PAGADO';
const ESTADO_PAGO_RECHAZADO = 'RECHAZADO';
const ESTADO_PAGO_CANCELADO = 'CANCELADO';

const MP_STATUS_APPROVED = 'approved';
const MP_STATUS_PENDING = 'pending';
const MP_STATUS_IN_PROCESS = 'in_process';
const MP_STATUS_REJECTED = 'rejected';
const MP_STATUS_CANCELLED = 'cancelled';

function normalizarEstadoSesion(estado) {
    return String(estado || '').trim().toUpperCase();
}

function mapearEstadoMercadoPago(status) {
    const normalized = String(status || '').trim().toLowerCase();
    switch (normalized) {
    case MP_STATUS_APPROVED:
        return ESTADO_PAGO_PAGADO;
    case MP_STATUS_PENDING:
    case MP_STATUS_IN_PROCESS:
        return ESTADO_PAGO_PENDIENTE;
    case MP_STATUS_REJECTED:
        return ESTADO_PAGO_RECHAZADO;
    case MP_STATUS_CANCELLED:
        return ESTADO_PAGO_CANCELADO;
    default:
        return ESTADO_PAGO_PENDIENTE;
    }
}

function esPagoAprobadoMp(status) {
    return String(status || '').trim().toLowerCase() === MP_STATUS_APPROVED;
}

function esPagoNoAprobadoTerminal(status) {
    const s = String(status || '').trim().toLowerCase();
    return s === MP_STATUS_REJECTED || s === MP_STATUS_CANCELLED;
}

function esPagoPendienteMp(status) {
    const s = String(status || '').trim().toLowerCase();
    return s === MP_STATUS_PENDING || s === MP_STATUS_IN_PROCESS || s === '';
}

/**
 * Decide la acción de dominio ante un evento de pago para una sesión MP.
 * @returns {'crear_pedido'|'actualizar_pendiente'|'registrar_no_aprobado'|'idempotente'|'ignorar'}
 */
function resolverAccionSesionMp({ estadoSesion, estadoProveedor, pedidoIdExistente = null }) {
    const sesion = normalizarEstadoSesion(estadoSesion);
    const estadoPago = mapearEstadoMercadoPago(estadoProveedor);

    if (sesion === ESTADO_SESION_PROCESADO || pedidoIdExistente) {
        return 'idempotente';
    }

    if (estadoPago === ESTADO_PAGO_PAGADO) {
        return 'crear_pedido';
    }

    if (sesion === ESTADO_SESION_EXPIRADO) {
        return 'ignorar';
    }

    if (estadoPago === ESTADO_PAGO_PENDIENTE) {
        return 'actualizar_pendiente';
    }

    if (estadoPago === ESTADO_PAGO_RECHAZADO || estadoPago === ESTADO_PAGO_CANCELADO) {
        return 'registrar_no_aprobado';
    }

    return 'ignorar';
}

/**
 * Selecciona el pago canónico de una lista MP: prioriza approved más reciente.
 */
function seleccionarPagoCanonicoMp(results = []) {
    if (!Array.isArray(results) || results.length === 0) {
        return null;
    }
    const approved = results.find((p) => esPagoAprobadoMp(p?.status));
    if (approved) {
        return approved;
    }
    return results[0];
}

/**
 * Mapea estado de sesión + último estado MP a estado de pago para UI.
 */
function mapearEstadoPagoUiDesdeSesion(sesion, pedido) {
    const est = normalizarEstadoSesion(sesion?.estado);
    if (est === ESTADO_SESION_PROCESADO && pedido) {
        const ep = pedido.estado_pago != null ? String(pedido.estado_pago).trim().toUpperCase() : null;
        return ep || ESTADO_PAGO_PAGADO;
    }
    if (est === ESTADO_SESION_PENDIENTE || est === ESTADO_SESION_CANCELADO) {
        const mp = String(sesion?.estado_mp || '').trim().toLowerCase();
        if (esPagoAprobadoMp(mp)) return ESTADO_PAGO_PAGADO;
        if (mp === MP_STATUS_REJECTED) return ESTADO_PAGO_RECHAZADO;
        if (mp === MP_STATUS_CANCELLED) return ESTADO_PAGO_CANCELADO;
        if (esPagoPendienteMp(mp)) return ESTADO_PAGO_PENDIENTE;
        return ESTADO_PAGO_PENDIENTE;
    }
    if (est === ESTADO_SESION_EXPIRADO) {
        return ESTADO_PAGO_CANCELADO;
    }
    return ESTADO_PAGO_PENDIENTE;
}

function sesionReconciliable(estadoSesion) {
    const est = normalizarEstadoSesion(estadoSesion);
    return est === ESTADO_SESION_PENDIENTE || est === ESTADO_SESION_CANCELADO;
}

module.exports = {
    ESTADO_SESION_PENDIENTE,
    ESTADO_SESION_PROCESADO,
    ESTADO_SESION_CANCELADO,
    ESTADO_SESION_EXPIRADO,
    ESTADO_PAGO_PENDIENTE,
    ESTADO_PAGO_PAGADO,
    ESTADO_PAGO_RECHAZADO,
    ESTADO_PAGO_CANCELADO,
    normalizarEstadoSesion,
    mapearEstadoMercadoPago,
    esPagoAprobadoMp,
    esPagoNoAprobadoTerminal,
    esPagoPendienteMp,
    resolverAccionSesionMp,
    seleccionarPagoCanonicoMp,
    mapearEstadoPagoUiDesdeSesion,
    sesionReconciliable
};
