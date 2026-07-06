const MEDIOS_ARCA = new Set(['MERCADOPAGO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA_FACTURADA']);

function normalizarMedioPago(medioPago) {
  return String(medioPago || 'EFECTIVO').trim().toUpperCase();
}

function requiereArca(medioPago) {
  return MEDIOS_ARCA.has(normalizarMedioPago(medioPago));
}

function resolverTipoFactura(medioPago) {
  return requiereArca(medioPago) ? 'C' : 'X';
}

function resolverCaeEstadoInicial(medioPago) {
  return requiereArca(medioPago) ? 'PENDIENTE' : 'NO_APLICA';
}

function resolverNombreCuenta(medioPago) {
  return requiereArca(medioPago) ? 'ARCA' : 'X';
}

/** Elige el medio fiscal: si alguno requiere ARCA lo retorna, sino el primero. */
function resolverMedioFiscalDesdeSplit(mediosPago) {
  const conArca = mediosPago.find((m) => requiereArca(normalizarMedioPago(m.medio_pago)));
  return normalizarMedioPago((conArca || mediosPago[0]).medio_pago);
}

/** Genera label compuesto: "EFECTIVO + DEBITO" */
function generarLabelMediosPago(mediosPago) {
  return mediosPago.map((m) => normalizarMedioPago(m.medio_pago)).join(' + ');
}

module.exports = {
  MEDIOS_ARCA,
  normalizarMedioPago,
  requiereArca,
  resolverTipoFactura,
  resolverCaeEstadoInicial,
  resolverNombreCuenta,
  resolverMedioFiscalDesdeSplit,
  generarLabelMediosPago
};
