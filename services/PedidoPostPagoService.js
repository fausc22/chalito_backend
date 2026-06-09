const { cobrarPedidoIdempotente, ejecutarPostCobro } = require('./PedidoCobroService');

/**
 * Post-pago Mercado Pago: crea venta idempotente + ARCA + cola + sockets.
 */
async function procesarAprobacionMercadoPago({ pedidoId, paymentId, resumenPagoMp, io = null, req = null }) {
  const fakeReq = req || (io ? { app: { get: (k) => (k === 'io' ? io : null) } } : null);

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

  if (result.cobroNuevo) {
    await ejecutarPostCobro(
      {
        ...result,
        pedidoId,
        pedido: result.pedido
      },
      fakeReq
    );
  } else if (io && result.pedido) {
    try {
      const { getInstance: getSocketService } = require('./SocketService');
      const socketService = getSocketService(io);
      socketService.emitPedidoActualizado(pedidoId, result.pedido);
    } catch (_) { /* noop */ }
  }

  return {
    ...result,
    paymentId,
    autoCobro: true
  };
}

module.exports = { procesarAprobacionMercadoPago };
