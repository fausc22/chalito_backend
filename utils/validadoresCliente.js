function validarCuit(cuit) {
  const limpio = String(cuit || '').replace(/\D/g, '');
  if (limpio.length !== 11) {
    return { valido: false, mensaje: 'CUIT debe tener 11 dígitos' };
  }
  return { valido: true };
}

module.exports = { validarCuit };
