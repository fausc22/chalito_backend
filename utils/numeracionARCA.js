/**
 * Sincronización opcional de numeración local post-CAE.
 * Si no existe control_numeracion_facturas, no falla.
 */

const sincronizarNumeroAprobado = async (connection, tipoFiscal, numeroAprobado, puntoVenta = null) => {
  try {
    const pv = puntoVenta || parseInt(process.env.DEFAULT_PUNTO_VENTA, 10) || 1;
    const puntoVentaFormateado = String(pv).padStart(4, '0');
    await connection.execute(
      `UPDATE control_numeracion_facturas SET ultimo_numero = ?
       WHERE punto_venta = ? AND tipo_factura = ?`,
      [numeroAprobado, puntoVentaFormateado, tipoFiscal]
    );
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('⚠️ numeracionARCA sincronizar:', error.message);
    }
  }
};

module.exports = { sincronizarNumeroAprobado };
