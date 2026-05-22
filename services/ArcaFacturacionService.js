const db = require('../controllers/dbPromise');
const { roundFacturacion } = require('../utils/rounding');
const { sincronizarNumeroAprobado } = require('../utils/numeracionARCA');
const FondosArcaRouting = require('./FondosArcaRoutingService');

const IVA_RATE = 1.21;
let billingController = null;

(async () => {
  try {
    const billingModule = await import('../arca-microservice/controllers/billing.controller.js');
    billingController = billingModule.default;
  } catch (error) {
    console.error('❌ Error cargando billing ARCA:', error.message);
  }
})();

function obtenerFechaActualARCA() {
  const ahora = new Date();
  return parseInt(
    `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`,
    10
  );
}

function arcaFechaToSqlDate(fechaArca) {
  const fechaStr = String(fechaArca || '');
  if (!/^\d{8}$/.test(fechaStr)) return null;
  return `${fechaStr.slice(0, 4)}-${fechaStr.slice(4, 6)}-${fechaStr.slice(6, 8)}`;
}

async function getDbConnection() {
  return db.getConnection();
}

async function executeWithConnection(connection, query, params = []) {
  const [rows] = await connection.execute(query, params);
  return rows;
}

/**
 * Solicita CAE para una venta Factura B consumidor final.
 */
async function solicitarCaeParaVenta(ventaId, io = null) {
  if (!billingController) {
    await marcarCaeError(ventaId, 'Servicio ARCA no disponible');
    return { success: false, message: 'Servicio ARCA no disponible' };
  }

  const [ventaRows] = await db.execute(
    `SELECT id, fecha, cliente_nombre, subtotal, iva_total, total, cae_id, tipo_factura, cae_estado, medio_pago
     FROM ventas WHERE id = ?`,
    [ventaId]
  );
  if (!ventaRows.length) {
    return { success: false, message: 'Venta no encontrada' };
  }

  const venta = ventaRows[0];
  if (venta.cae_id) {
    return { success: true, existing: true, cae: venta.cae_id };
  }
  if (venta.tipo_factura !== 'B' || !FondosArcaRouting.requiereArca(venta.medio_pago)) {
    return { success: false, message: 'Venta no requiere CAE' };
  }

  const lockName = `arca_cae_B_${process.env.DEFAULT_PUNTO_VENTA || 1}`;
  let lockConnection = null;
  let lockAcquired = false;
  let intentoId = null;
  const inicioMs = Date.now();

  try {
    lockConnection = await getDbConnection();
    const lockRows = await executeWithConnection(
      lockConnection,
      'SELECT GET_LOCK(?, ?) AS lock_acquired',
      [lockName, 30]
    );
    if (!lockRows?.[0] || lockRows[0].lock_acquired !== 1) {
      throw new Error(`No se pudo obtener lock ${lockName}`);
    }
    lockAcquired = true;

    const [refRows] = await executeWithConnection(
      lockConnection,
      'SELECT cae_id FROM ventas WHERE id = ? LIMIT 1',
      [ventaId]
    );
    if (refRows[0]?.cae_id) {
      return { success: true, existing: true, cae: refRows[0].cae_id };
    }

    const [productosRows] = await db.execute(
      'SELECT articulo_nombre, cantidad, precio, subtotal FROM ventas_contenido WHERE venta_id = ?',
      [ventaId]
    );
    if (!productosRows.length) {
      throw new Error('Sin ítems en la venta');
    }

    const items = productosRows.map((prod) => {
      const cantidad = parseFloat(prod.cantidad) || 0;
      const precioFinal = parseFloat(prod.precio) || 0;
      const precioNeto = roundFacturacion(precioFinal / IVA_RATE);
      return {
        descripcion: prod.articulo_nombre,
        cantidad,
        precioUnitario: precioNeto,
        alicuotaIVA: 5
      };
    });

    const subtotalFinal = roundFacturacion(parseFloat(venta.subtotal) || 0);
    const ivaFinal = roundFacturacion(parseFloat(venta.iva_total) || 0);
    const totalVenta = roundFacturacion(parseFloat(venta.total) || 0);
    const fechaFormateada = obtenerFechaActualARCA();
    const puntoVenta = parseInt(process.env.DEFAULT_PUNTO_VENTA, 10) || 1;

    const datosFactura = {
      tipoComprobante: 6,
      concepto: 1,
      cliente: {
        tipoDocumento: 99,
        numeroDocumento: 0,
        condicionIVA: 5
      },
      items,
      fecha: fechaFormateada,
      moneda: 'PES',
      cotizacionMoneda: 1,
      impNeto: subtotalFinal,
      impIVA: ivaFinal,
      impOpEx: 0,
      impTotal: totalVenta,
      puntoVenta
    };

    const [intentoInsert] = await db.execute(
      `INSERT INTO arca_solicitudes_log (venta_id, request_data, estado) VALUES (?, ?, 'EN_PROCESO')`,
      [ventaId, JSON.stringify(datosFactura)]
    );
    intentoId = intentoInsert?.insertId;

    const mockRes = { statusCode: 200, jsonData: null };
    const mockReq = { body: datosFactura, user: {} };
    mockRes.status = function (code) {
      this.statusCode = code;
      return this;
    };
    mockRes.json = function (data) {
      this.jsonData = data;
      return this;
    };

    await billingController.crearFactura(mockReq, mockRes);
    const responseARCA = mockRes.jsonData;
    if (!responseARCA?.success) {
      throw new Error(responseARCA?.message || responseARCA?.error || 'Error ARCA');
    }

    const datosRespuesta = responseARCA.data;
    const cae =
      datosRespuesta?.autorizacion?.cae ||
      datosRespuesta?.autorizacion?.CAE ||
      datosRespuesta?.cae;
    const caeVencimiento =
      datosRespuesta?.autorizacion?.fechaVencimiento ||
      datosRespuesta?.autorizacion?.CAEFchVto ||
      datosRespuesta?.fechaVencimiento;
    const caeResultado = datosRespuesta?.autorizacion?.resultado || 'A';
    const numeroAprobado = datosRespuesta?.comprobante?.numero || datosRespuesta?.voucher_number;
    const numeroCompleto = numeroAprobado
      ? `B ${String(puntoVenta).padStart(4, '0')}-${String(numeroAprobado).padStart(8, '0')}`
      : null;

    if (!cae) {
      throw new Error('Respuesta ARCA sin CAE');
    }

    const fechaFiscalSql = arcaFechaToSqlDate(fechaFormateada);
    await db.execute(
      `UPDATE ventas SET
        cae_id = ?, cae_fecha = ?, cae_resultado = ?, cae_estado = 'OK',
        cae_solicitud_fecha = NOW(), cae_mensaje_error = NULL,
        numero_factura = COALESCE(?, numero_factura),
        punto_venta = ?
       WHERE id = ?`,
      [cae, caeVencimiento, caeResultado, numeroCompleto, puntoVenta, ventaId]
    );

    if (intentoId) {
      await db.execute(
        `UPDATE arca_solicitudes_log SET response_data = ?, estado = 'EXITOSO', tiempo_respuesta = ? WHERE id = ?`,
        [JSON.stringify(responseARCA), Date.now() - inicioMs, intentoId]
      );
    }

    if (numeroAprobado) {
      try {
        const syncConn = await getDbConnection();
        try {
          await sincronizarNumeroAprobado(syncConn, 'B', numeroAprobado, puntoVenta);
        } finally {
          syncConn.release();
        }
      } catch (_) { /* noop */ }
    }

    if (io) {
      try {
        const { getInstance: getSocketService } = require('./SocketService');
        getSocketService(io).emitVentaCaeObtenido(ventaId, { venta_id: ventaId, cae, numero_factura: numeroCompleto });
      } catch (_) { /* noop */ }
    }

    return { success: true, cae, numero_factura: numeroCompleto };
  } catch (error) {
    console.error(`❌ CAE venta ${ventaId}:`, error.message);
    await marcarCaeError(ventaId, error.message, intentoId, Date.now() - inicioMs);
    return { success: false, error: error.message };
  } finally {
    if (lockAcquired && lockConnection) {
      try {
        await executeWithConnection(lockConnection, 'SELECT RELEASE_LOCK(?) AS released', [lockName]);
      } catch (_) { /* noop */ }
      lockConnection.release();
    }
  }
}

async function marcarCaeError(ventaId, mensaje, intentoId = null, tiempoRespuesta = null) {
  await db.execute(
    `UPDATE ventas SET cae_estado = 'ERROR', cae_mensaje_error = ? WHERE id = ? AND cae_estado IN ('PENDIENTE','ERROR')`,
    [String(mensaje).slice(0, 500), ventaId]
  );
  if (intentoId) {
    await db.execute(
      `UPDATE arca_solicitudes_log SET estado = 'ERROR', mensaje_error = ?, tiempo_respuesta = ? WHERE id = ?`,
      [String(mensaje).slice(0, 65535), tiempoRespuesta, intentoId]
    );
  }
}

function encolarSolicitudCae(ventaId, io = null) {
  setImmediate(() => {
    solicitarCaeParaVenta(ventaId, io).catch((err) => {
      console.error(`❌ encolarSolicitudCae venta ${ventaId}:`, err.message);
    });
  });
}

module.exports = {
  solicitarCaeParaVenta,
  encolarSolicitudCae,
  marcarCaeError
};
