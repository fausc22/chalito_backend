const db = require('../controllers/dbPromise');
const { cobrarPedidoIdempotente, ejecutarPostCobro } = require('./PedidoCobroService');
const { buscarVentaAsociada } = require('./PrintService');

function buildFakeReq({ io = null, req = null }) {
  return req || (io ? { app: { get: (k) => (k === 'io' ? io : null) } } : null);
}

/**
 * Reconcilia venta faltante para un pedido ya marcado como PAGADO (idempotente).
 */
async function reconciliarVentaPedidoPagado({ pedidoId, io = null, req = null, connection = null }) {
  const ventaExistente = await buscarVentaAsociada(pedidoId);
  if (ventaExistente) {
    return {
      success: true,
      reconciliado: false,
      cobroNuevo: false,
      ventaId: ventaExistente.id,
      venta: ventaExistente
    };
  }

  const fakeReq = buildFakeReq({ io, req });
  const result = await cobrarPedidoIdempotente({
    pedidoId,
    descuentoPorcentaje: 0,
    usuario: { nombre: 'Reconciliación', usuario: 'sistema' },
    req: fakeReq,
    connection,
    skipEstadoPagoCheck: true
  });

  if (!result.success) {
    console.warn(`⚠️ [Reconciliación] Venta pedido #${pedidoId}:`, result.message);
    return { ...result, reconciliado: false };
  }

  if (!result.ventaId) {
    console.warn(`⚠️ [Reconciliación] Pedido #${pedidoId} sigue sin venta tras cobro idempotente`);
    return {
      success: false,
      reconciliado: false,
      message: 'No se pudo crear venta asociada',
      code: 'RECONCILIACION_SIN_VENTA'
    };
  }

  if (result.cobroNuevo && !connection) {
    await ejecutarPostCobro({ ...result, pedidoId }, fakeReq);
  }

  console.log(`✅ [Reconciliación] Venta #${result.ventaId} asociada a pedido #${pedidoId}`);
  return {
    ...result,
    reconciliado: Boolean(result.cobroNuevo)
  };
}

/**
 * Post-pago Mercado Pago: crea venta idempotente + cola + sockets.
 */
async function procesarAprobacionMercadoPago({ pedidoId, paymentId, resumenPagoMp, io = null, req = null }) {
  const fakeReq = buildFakeReq({ io, req });

  const result = await cobrarPedidoIdempotente({
    pedidoId,
    medioPago: 'MERCADOPAGO',
    descuentoPorcentaje: 0,
    usuario: { nombre: 'MercadoPago', usuario: 'mercadopago' },
    req: fakeReq,
    skipEstadoPagoCheck: true
  });

  if (!result.success) {
    console.warn(`⚠️ [MP] Auto-cobro pedido #${pedidoId}:`, result.message);
    return { ...result, paymentId };
  }

  if (!result.ventaId) {
    console.warn(`⚠️ [MP] Auto-cobro pedido #${pedidoId} completó sin venta asociada`);
    return {
      ...result,
      paymentId,
      autoCobro: true,
      success: false,
      message: 'Pedido pagado sin venta asociada tras auto-cobro',
      code: 'AUTO_COBRO_SIN_VENTA'
    };
  }

  if (result.cobroNuevo) {
    console.log(`✅ [MP] Auto-cobro pedido #${pedidoId} → venta #${result.ventaId}`);
    await ejecutarPostCobro(
      {
        ...result,
        pedidoId,
        pedido: result.pedido
      },
      fakeReq
    );
  } else {
    console.log(`ℹ️ [MP] Auto-cobro pedido #${pedidoId}: venta #${result.ventaId} ya existía`);
    if (io && result.pedido) {
      try {
        const { getInstance: getSocketService } = require('./SocketService');
        const socketService = getSocketService(io);
        socketService.emitPedidoActualizado(pedidoId, result.pedido);
      } catch (_) { /* noop */ }
    }
  }

  return {
    ...result,
    paymentId,
    autoCobro: true
  };
}

/**
 * Worker: recupera pedidos MP PAGADO recientes que quedaron sin venta asociada.
 */
async function reconciliarPedidosMpPagadosSinVenta({ limite = 20 } = {}) {
  const [pedidos] = await db.execute(
    `SELECT id
     FROM pedidos
     WHERE estado_pago = 'PAGADO'
       AND UPPER(COALESCE(medio_pago, '')) = 'MERCADOPAGO'
       AND fecha >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY id DESC
     LIMIT ?`,
    [Math.max(1, Math.min(Number(limite) || 20, 100))]
  );

  let recuperados = 0;
  for (const row of pedidos) {
    const pedidoId = Number(row.id);
    const venta = await buscarVentaAsociada(pedidoId);
    if (venta) continue;

    try {
      const result = await reconciliarVentaPedidoPagado({ pedidoId });
      if (result.success && result.reconciliado) {
        recuperados += 1;
      }
    } catch (err) {
      console.warn(`⚠️ [MP][Worker] Reconciliación venta pedido #${pedidoId}:`, err.message);
    }
  }

  if (recuperados > 0) {
    console.log(`✅ [MP][Worker] Ventas recuperadas: ${recuperados}`);
  }

  return { revisados: pedidos.length, recuperados };
}

module.exports = {
  procesarAprobacionMercadoPago,
  reconciliarVentaPedidoPagado,
  reconciliarPedidosMpPagadosSinVenta
};
