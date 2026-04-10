/**
 * Reglas para incluir un pedido en flujo de cocina (worker, capacidad, transiciones operativas).
 *
 * Bloqueado si:
 * - medio_pago = MERCADOPAGO y estado_pago <> PAGADO (cualquier origen)
 * - origen WEB + transferencia bancaria y estado_pago <> PAGADO (comportamiento previo)
 */

function normalizarUpper(val) {
    return String(val ?? '').trim().toUpperCase();
}

function pedidoEstaBloqueadoPorMercadoPagoPendiente(pedido) {
    const medio = normalizarUpper(pedido?.medio_pago);
    const estadoPago = normalizarUpper(pedido?.estado_pago);
    return medio === 'MERCADOPAGO' && estadoPago !== 'PAGADO';
}

function pedidoEstaBloqueadoPorTransferenciaWebPendiente(pedido) {
    const origen = normalizarUpper(pedido?.origen_pedido);
    const medio = normalizarUpper(pedido?.medio_pago);
    const estadoPago = normalizarUpper(pedido?.estado_pago);
    return origen === 'WEB' && medio === 'TRANSFERENCIA' && estadoPago !== 'PAGADO';
}

function pedidoEstaHabilitadoOperativamente(pedido) {
    if (!pedido || typeof pedido !== 'object') return false;
    if (pedidoEstaBloqueadoPorMercadoPagoPendiente(pedido)) return false;
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
  AND (
    (UPPER(TRIM(COALESCE(medio_pago, ''))) <> 'MERCADOPAGO' OR UPPER(TRIM(COALESCE(estado_pago, ''))) = 'PAGADO')
    AND NOT (
      UPPER(TRIM(COALESCE(origen_pedido, ''))) = 'WEB'
      AND UPPER(TRIM(COALESCE(medio_pago, ''))) = 'TRANSFERENCIA'
      AND UPPER(TRIM(COALESCE(estado_pago, ''))) <> 'PAGADO'
    )
  )
`;

module.exports = {
    pedidoEstaHabilitadoOperativamente,
    pedidoEstaBloqueadoPorMercadoPagoPendiente,
    pedidoEstaBloqueadoPorTransferenciaWebPendiente,
    esEstadoAvanceOperativoCocina,
    SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE
};
