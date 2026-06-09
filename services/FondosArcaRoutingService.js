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

module.exports = {
  MEDIOS_ARCA,
  normalizarMedioPago,
  requiereArca,
  resolverTipoFactura,
  resolverCaeEstadoInicial,
  resolverNombreCuenta
};
