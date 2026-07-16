/**
 * Reglas para incluir un pedido en flujo de cocina (worker, capacidad, transiciones operativas).
 *
 * Bloqueado si origen WEB y pago digital pendiente:
 * - WEB + MERCADOPAGO y estado_pago <> PAGADO
 * - WEB + TRANSFERENCIA y estado_pago <> PAGADO
 *
 * Pedidos presenciales (MOSTRADOR/TELEFONO/WHATSAPP) pueden avanzar a cocina
 * aunque el cobro aún esté pendiente.
 */

function normalizarUpper(val) {
    return String(val ?? '').trim().toUpperCase();
}

function pedidoEstaBloqueadoPorMercadoPagoWebPendiente(pedido) {
    const origen = normalizarUpper(pedido?.origen_pedido);
    const medio = normalizarUpper(pedido?.medio_pago);
    const estadoPago = normalizarUpper(pedido?.estado_pago);
    return origen === 'WEB' && medio === 'MERCADOPAGO' && estadoPago !== 'PAGADO';
}

/** @deprecated Alias histórico; preferir pedidoEstaBloqueadoPorMercadoPagoWebPendiente */
function pedidoEstaBloqueadoPorMercadoPagoPendiente(pedido) {
    return pedidoEstaBloqueadoPorMercadoPagoWebPendiente(pedido);
}

function pedidoEstaBloqueadoPorTransferenciaWebPendiente(pedido) {
    const origen = normalizarUpper(pedido?.origen_pedido);
    const medio = normalizarUpper(pedido?.medio_pago);
    const estadoPago = normalizarUpper(pedido?.estado_pago);
    return origen === 'WEB' && medio === 'TRANSFERENCIA' && estadoPago !== 'PAGADO';
}

function pedidoEstaHabilitadoOperativamente(pedido) {
    if (!pedido || typeof pedido !== 'object') return false;
    if (pedidoEstaBloqueadoPorMercadoPagoWebPendiente(pedido)) return false;
    if (pedidoEstaBloqueadoPorTransferenciaWebPendiente(pedido)) return false;
    return true;
}

/** Transiciones de cocina que no deben permitirse si el pedido está bloqueado por pago */
function esEstadoAvanceOperativoCocina(estado) {
    const e = normalizarUpper(estado);
    return e === 'EN_PREPARACION' || e === 'LISTO';
}

/**
 * Fragmento SQL reutilizable (incluye AND inicial) para filas de la tabla `pedidos`.
 * Equivalencia: pedidoEstaHabilitadoOperativamente(row) === true
 */
const SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE = `
  AND NOT (
    UPPER(TRIM(COALESCE(origen_pedido, ''))) = 'WEB'
    AND UPPER(TRIM(COALESCE(medio_pago, ''))) IN ('MERCADOPAGO', 'TRANSFERENCIA')
    AND UPPER(TRIM(COALESCE(estado_pago, ''))) <> 'PAGADO'
  )
`;

module.exports = {
    pedidoEstaHabilitadoOperativamente,
    pedidoEstaBloqueadoPorMercadoPagoPendiente,
    pedidoEstaBloqueadoPorMercadoPagoWebPendiente,
    pedidoEstaBloqueadoPorTransferenciaWebPendiente,
    esEstadoAvanceOperativoCocina,
    SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE
};
