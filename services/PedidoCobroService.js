const db = require('../controllers/dbPromise');
const { auditarOperacion } = require('../middlewares/auditoriaMiddleware');
const { buildPedidoSnapshotById, enrichPedidoRealtime } = require('./pedidoRealtimeSerializer');
const {
  calcularTotalesConDescuentoPorcentaje,
  calcularTotalesDesdePrecioFinal,
  obtenerTotalFinalDesdeRegistro
} = require('./totalesPrecioFinal');
const FondosArcaRouting = require('./FondosArcaRoutingService');
const CuentasSistema = require('./CuentasSistemaService');
const { buscarVentaAsociada } = require('./PrintService');

function normalizarInputMedios(medioPago, mediosPago, totalFinal, medioPedidoFallback) {
  if (Array.isArray(mediosPago) && mediosPago.length > 0) {
    return mediosPago.map((m) => ({
      medio_pago: FondosArcaRouting.normalizarMedioPago(m.medio_pago),
      monto: parseFloat(m.monto)
    }));
  }
  return [{
    medio_pago: FondosArcaRouting.normalizarMedioPago(medioPago || medioPedidoFallback),
    monto: totalFinal
  }];
}

/**
 * Cobro idempotente de pedido → venta + movimiento de fondos.
 */
async function cobrarPedidoIdempotente({
  pedidoId,
  medioPago,
  mediosPago = null,
  descuentoPorcentaje = 0,
  usuario = {},
  req = null,
  connection: externalConnection = null,
  skipEstadoPagoCheck = false
}) {
  const ownConnection = !externalConnection;
  const connection = externalConnection || await db.getConnection();

  try {
    if (ownConnection) {
      await connection.beginTransaction();
    }

    const [pedidos] = await connection.execute('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [pedidoId]);
    if (!pedidos.length) {
      if (ownConnection) await connection.rollback();
      return { success: false, status: 404, message: 'Pedido no encontrado' };
    }

    const pedido = enrichPedidoRealtime(pedidos[0]);

    if (pedido.estado === 'CANCELADO') {
      if (ownConnection) await connection.rollback();
      return {
        success: false,
        status: 400,
        message: 'No se puede cobrar un pedido cancelado',
        code: 'PEDIDO_CANCELADO'
      };
    }

    if (pedido.estado_pago === 'PAGADO') {
      const ventaExistente = await buscarVentaAsociada(pedidoId);
      if (ventaExistente) {
        if (ownConnection) await connection.rollback();
        const pedidoCompleto = await buildPedidoSnapshotById({
          pedidoId,
          connection,
          includeArticulos: true
        });
        return {
          success: true,
          cobroNuevo: false,
          pedido: pedidoCompleto,
          ventaId: ventaExistente.id,
          venta: ventaExistente
        };
      }
      // Pedido ya PAGADO (p. ej. MP) pero sin venta: continuar para reconciliar idempotentemente.
      console.log(`🔄 [Cobro] Reconciliando venta faltante para pedido #${pedidoId} (estado_pago=PAGADO)`);
    }

    const [articulosPedido] = await connection.execute(
      'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
      [pedidoId]
    );
    if (!articulosPedido.length) {
      if (ownConnection) await connection.rollback();
      return { success: false, status: 400, message: 'El pedido no tiene artículos' };
    }

    const porcentaje = Number(descuentoPorcentaje);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      if (ownConnection) await connection.rollback();
      return {
        success: false,
        status: 400,
        message: 'El descuento_porcentaje debe estar entre 0 y 100',
        code: 'DESCUENTO_PORCENTAJE_INVALIDO'
      };
    }

    const totalPedidoCobro = obtenerTotalFinalDesdeRegistro(pedido);
    const totalesVenta = calcularTotalesConDescuentoPorcentaje(totalPedidoCobro, porcentaje);
    if (totalesVenta.total < 0) {
      if (ownConnection) await connection.rollback();
      return { success: false, status: 400, message: 'El total final no puede ser negativo', code: 'TOTAL_FINAL_NEGATIVO' };
    }

    const mediosNorm = normalizarInputMedios(medioPago, mediosPago, totalesVenta.total, pedido.medio_pago);

    for (const linea of mediosNorm) {
      if (!Number.isFinite(linea.monto) || linea.monto <= 0) {
        if (ownConnection) await connection.rollback();
        return {
          success: false,
          status: 400,
          message: 'Cada medio de pago debe tener un monto mayor a 0',
          code: 'MONTO_MEDIO_INVALIDO'
        };
      }
    }

    if (mediosNorm.length > 1) {
      const mediosUnicos = new Set(mediosNorm.map((m) => m.medio_pago));
      if (mediosUnicos.size !== mediosNorm.length) {
        if (ownConnection) await connection.rollback();
        return {
          success: false,
          status: 400,
          message: 'Los medios de pago deben ser distintos',
          code: 'MEDIOS_DUPLICADOS'
        };
      }
    }

    const sumaMontos = mediosNorm.reduce((s, m) => s + m.monto, 0);
    if (Math.abs(sumaMontos - totalesVenta.total) > 0.01) {
      if (ownConnection) await connection.rollback();
      return {
        success: false,
        status: 400,
        message: `La suma de los medios ($${sumaMontos.toFixed(2)}) no coincide con el total a cobrar ($${totalesVenta.total.toFixed(2)})`,
        code: 'SUMA_MEDIOS_INVALIDA'
      };
    }

    const medioFiscal = FondosArcaRouting.resolverMedioFiscalDesdeSplit(mediosNorm);
    const tipoFactura = FondosArcaRouting.resolverTipoFactura(medioFiscal);
    const caeEstado = FondosArcaRouting.resolverCaeEstadoInicial(medioFiscal);
    const nombreCuenta = FondosArcaRouting.resolverNombreCuenta(medioFiscal);
    const cuentaFiscal = await CuentasSistema.obtenerCuentaPorNombre(nombreCuenta, connection);
    const labelMedio = mediosNorm.length > 1
      ? FondosArcaRouting.generarLabelMediosPago(mediosNorm)
      : mediosNorm[0].medio_pago;

    const ventaInsert = `
      INSERT INTO ventas (
        pedido_id, cliente_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
        subtotal, iva_total, descuento, total, medio_pago, cuenta_id,
        estado, observaciones, tipo_factura, cae_estado, usuario_id, usuario_nombre
      ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FACTURADA', ?, ?, ?, ?, ?)
    `;
    const ventaParams = [
      pedidoId,
      pedido.cliente_id || null,
      pedido.cliente_nombre,
      pedido.cliente_direccion,
      pedido.cliente_telefono,
      pedido.cliente_email,
      totalesVenta.subtotal,
      totalesVenta.iva_total,
      totalesVenta.descuento,
      totalesVenta.total,
      labelMedio,
      cuentaFiscal.id,
      pedido.observaciones,
      tipoFactura,
      caeEstado,
      usuario.id || null,
      usuario.nombre || usuario.usuario || null
    ];

    let ventaResult;
    try {
      [ventaResult] = await connection.execute(ventaInsert, ventaParams);
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' && String(err.message).includes('pedido_id')) {
        const ventaInsertLegacy = `
          INSERT INTO ventas (
            cliente_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
            subtotal, iva_total, descuento, total, medio_pago, cuenta_id,
            estado, observaciones, tipo_factura, cae_estado, usuario_id, usuario_nombre
          ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FACTURADA', ?, ?, ?, ?, ?)
        `;
        [ventaResult] = await connection.execute(ventaInsertLegacy, ventaParams.slice(1));
      } else if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        if (ownConnection) await connection.rollback();
        const ventaExistente = await buscarVentaAsociada(pedidoId);
        return {
          success: true,
          cobroNuevo: false,
          pedido,
          ventaId: ventaExistente?.id,
          venta: ventaExistente
        };
      } else {
        throw err;
      }
    }

    const ventaId = ventaResult.insertId;

    for (const articulo of articulosPedido) {
      await connection.execute(
        `INSERT INTO ventas_contenido (venta_id, articulo_id, articulo_nombre, cantidad, precio, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ventaId, articulo.articulo_id, articulo.articulo_nombre, articulo.cantidad, articulo.precio, articulo.subtotal]
      );
    }

    const totalesPedido = calcularTotalesDesdePrecioFinal(totalPedidoCobro);
    await connection.execute(
      `UPDATE pedidos SET estado_pago = 'PAGADO', medio_pago = ?, subtotal = ?, iva_total = ?, total = ?, fecha_modificacion = NOW() WHERE id = ?`,
      [labelMedio, totalesPedido.subtotal, totalesPedido.iva_total, totalesPedido.total, pedidoId]
    );

    for (const linea of mediosNorm) {
      const nombreCuentaLinea = FondosArcaRouting.resolverNombreCuenta(linea.medio_pago);
      const cuentaLinea = await CuentasSistema.obtenerCuentaPorNombre(nombreCuentaLinea, connection);
      await CuentasSistema.acreditarCuenta(
        connection,
        cuentaLinea.id,
        linea.monto,
        `Venta #${ventaId} (Pedido #${pedidoId}) - ${linea.medio_pago}`,
        ventaId
      );
    }

    if (mediosNorm.length > 1) {
      for (let i = 0; i < mediosNorm.length; i++) {
        await connection.execute(
          `INSERT INTO pedidos_medios_pago (pedido_id, medio_pago, monto, orden) VALUES (?, ?, ?, ?)`,
          [pedidoId, mediosNorm[i].medio_pago, mediosNorm[i].monto, i + 1]
        );
      }
    }

    if (ownConnection) {
      await connection.commit();
    }

    if (req) {
      await auditarOperacion(req, {
        accion: 'COBRAR_PEDIDO',
        tabla: 'pedidos',
        registroId: pedidoId,
        datosAnteriores: pedido,
        datosNuevos: { ...pedido, estado_pago: 'PAGADO' },
        detallesAdicionales: mediosNorm.length > 1
          ? `Pedido cobrado - Venta #${ventaId} - Split: ${labelMedio}`
          : `Pedido cobrado - Venta #${ventaId} - Cuenta ${nombreCuenta}`
      });
    }

    const pedidoActualizado = await buildPedidoSnapshotById({
      pedidoId,
      connection,
      includeArticulos: true
    });

    const result = {
      success: true,
      cobroNuevo: true,
      pedido: pedidoActualizado,
      ventaId,
      medio: labelMedio,
      tipoFactura,
      requiereArca: FondosArcaRouting.requiereArca(medioFiscal),
      total: totalesVenta.total
    };

    if (ownConnection) {
      await ejecutarPostCobro(result, req);
    }

    return result;
  } catch (error) {
    if (ownConnection) {
      try {
        await connection.rollback();
      } catch (_) { /* noop */ }
    }
    throw error;
  } finally {
    if (ownConnection) {
      connection.release();
    }
  }
}

async function ejecutarPostCobro(result, req = null) {
  if (!result.success || !result.cobroNuevo) return;

  const pedidoId = result.pedido?.id ?? result.pedidoId;
  const ventaId = result.ventaId;

  // CAE se encola al marcar pedido ENTREGADO (no al cobrar)

  try {
    const { OrderQueueEngine } = require('./OrderQueueEngine');
    await OrderQueueEngine.activarFlujoSiCorrespondeTrasPago(pedidoId);
  } catch (e) {
    console.warn(`⚠️ Post-cobro cola pedido #${pedidoId}:`, e.message);
  }

  const io = req?.app?.get('io');
  if (io && result.pedido) {
    try {
      const { getInstance: getSocketService } = require('./SocketService');
      const socketService = getSocketService(io);
      socketService.emitPedidoCobrado(pedidoId, ventaId, result.pedido);
      socketService.emitPedidoActualizado(pedidoId, result.pedido);
      socketService.emitVentaCreada(ventaId, { venta_id: ventaId, pedido_id: pedidoId, total: result.total });
    } catch (e) {
      console.warn('⚠️ Post-cobro sockets:', e.message);
    }
  }
}

module.exports = {
  cobrarPedidoIdempotente,
  ejecutarPostCobro
};
