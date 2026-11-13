import { PORCENTAJES_IVA, ALICUOTAS_IVA, esComprobanteC, esNotaCredito, esNotaDebito } from '../types/billing.types.js';

/**
 * FORMATEADORES DE DATOS PARA ARCA/AFIP
 */

/**
 * Obtener fecha actual en formato YYYYMMDD
 */
export function obtenerFechaActual() {
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  
  return parseInt(`${año}${mes}${dia}`);
}

/**
 * Convertir fecha de YYYYMMDD a YYYY-MM-DD
 */
export function formatearFecha(fechaYYYYMMDD) {
  const str = fechaYYYYMMDD.toString();
  return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
}

/**
 * Convertir fecha de Date a YYYYMMDD
 */
export function dateAFormatoARCA(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  
  return parseInt(`${año}${mes}${dia}`);
}

/**
 * Redondear a 2 decimales
 */
export function redondear(numero) {
  return Math.round(numero * 100) / 100;
}

/**
 * Calcular IVA desde un precio neto
 */
export function calcularIVA(precioNeto, alicuotaId) {
  const porcentaje = PORCENTAJES_IVA[alicuotaId] || 0;
  return redondear(precioNeto * (porcentaje / 100));
}

/**
 * Calcular precio total (neto + IVA)
 */
export function calcularPrecioTotal(precioNeto, alicuotaId) {
  const iva = calcularIVA(precioNeto, alicuotaId);
  return redondear(precioNeto + iva);
}

function esOperacionExenta(alicuotaId) {
  return Number(alicuotaId) === ALICUOTAS_IVA.OPERACION_EXENTA;
}

/**
 * Separar la base de operaciones exentas (alícuota 2 → ImpOpEx)
 * de las líneas gravadas, incluida la alícuota 3 (0 %).
 * La condición IVA del receptor no interviene.
 */
export function separarBaseExenta(items) {
  let baseExenta = 0;

  (items || []).forEach(item => {
    if (!esOperacionExenta(item.alicuotaIVA)) return;
    baseExenta += item.cantidad * item.precioUnitario;
  });

  return redondear(baseExenta);
}

/**
 * Agrupar líneas gravadas por la alícuota del ítem.
 * La alícuota 2 no entra en el array Iva.
 */
export function agruparIVAPorAlicuota(items) {
  const agrupado = {};

  (items || []).forEach(item => {
    if (esOperacionExenta(item.alicuotaIVA)) return;

    const alicuotaId = Number(item.alicuotaIVA);
    const precioNeto = item.cantidad * item.precioUnitario;
    const iva = calcularIVA(precioNeto, alicuotaId);

    if (!agrupado[alicuotaId]) {
      agrupado[alicuotaId] = {
        Id: alicuotaId,
        BaseImp: 0,
        Importe: 0
      };
    }

    agrupado[alicuotaId].BaseImp += precioNeto;
    agrupado[alicuotaId].Importe += iva;
  });

  return Object.values(agrupado).map(alicuota => ({
    Id: alicuota.Id,
    BaseImp: redondear(alicuota.BaseImp),
    Importe: redondear(alicuota.Importe)
  }));
}

/**
 * Calcular totales desde las líneas.
 * El IVA sale de la alícuota del ítem, no de la condición del cliente.
 */
export function calcularTotales(items) {
  const ivaAgrupado = agruparIVAPorAlicuota(items);
  const totalNeto = redondear(ivaAgrupado.reduce((acc, alicuota) => acc + alicuota.BaseImp, 0));
  const totalIVA = redondear(ivaAgrupado.reduce((acc, alicuota) => acc + alicuota.Importe, 0));
  const totalExento = separarBaseExenta(items);

  return {
    totalNeto,
    totalIVA,
    totalExento,
    total: redondear(totalNeto + totalIVA + totalExento)
  };
}

/**
 * El comprobante ya guardado manda neto, IVA y total.
 * El array Iva conserva la alícuota de la línea y cierra con esa cabecera.
 */
function alinearIvaACabecera(ivaAgrupado, impNeto, impIVA) {
  if (!ivaAgrupado.length) {
    if (impNeto > 0 && impIVA === 0) {
      return [{ Id: ALICUOTAS_IVA.IVA_0, BaseImp: redondear(impNeto), Importe: 0 }];
    }
    return [];
  }

  if (ivaAgrupado.length === 1) {
    return [{
      Id: ivaAgrupado[0].Id,
      BaseImp: redondear(impNeto),
      Importe: redondear(impIVA)
    }];
  }

  const sumaBase = ivaAgrupado.reduce((acc, alicuota) => acc + alicuota.BaseImp, 0);
  const sumaIva = ivaAgrupado.reduce((acc, alicuota) => acc + alicuota.Importe, 0);
  const copia = ivaAgrupado.map(alicuota => ({
    Id: alicuota.Id,
    BaseImp: sumaBase > 0 ? redondear((alicuota.BaseImp / sumaBase) * impNeto) : 0,
    Importe: sumaIva > 0 ? redondear((alicuota.Importe / sumaIva) * impIVA) : 0
  }));
  const ultimo = copia.length - 1;
  const basePrevia = redondear(copia.slice(0, ultimo).reduce((acc, alicuota) => acc + alicuota.BaseImp, 0));
  const ivaPrevio = redondear(copia.slice(0, ultimo).reduce((acc, alicuota) => acc + alicuota.Importe, 0));
  copia[ultimo].BaseImp = redondear(impNeto - basePrevia);
  copia[ultimo].Importe = redondear(impIVA - ivaPrevio);
  return copia;
}

/**
 * Formatear número de documento eliminando puntos y guiones
 */
export function formatearDocumento(documento) {
  return documento.toString().replace(/[.-]/g, '');
}

/**
 * Transformar datos de entrada al formato WSFEv1.
 * Factura A y Factura B informan el IVA igual. La condición del receptor
 * solo viaja en CondicionIVAReceptorId: no cambia la alícuota ni ImpOpEx.
 * Si el comprobante ya trae neto, IVA y total, esos importes se respetan.
 */
export function transformarAFormatoARCA(datosUsuario, numeroComprobante, puntoVenta) {
  const condicionIVAReceptor = datosUsuario.cliente.condicionIVA;
  const esFacturaC = esComprobanteC(datosUsuario.tipoComprobante);
  const fueInformado = (value) => Number.isFinite(parseFloat(value));
  const toNumber = (value, fallback = 0) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const totales = calcularTotales(datosUsuario.items);
  const ivaAgrupado = esFacturaC ? [] : agruparIVAPorAlicuota(datosUsuario.items);

  const documentoFormateado = formatearDocumento(datosUsuario.cliente.numeroDocumento);

  const fecha = datosUsuario.fecha
    ? (typeof datosUsuario.fecha === 'number' ? datosUsuario.fecha : dateAFormatoARCA(datosUsuario.fecha))
    : obtenerFechaActual();

  const impTotConc = toNumber(datosUsuario.impTotConc, 0);
  const impTrib = toNumber(datosUsuario.impTrib, 0);
  const netoExplicito = fueInformado(datosUsuario.impNeto);
  const ivaExplicito = fueInformado(datosUsuario.impIVA);
  const opExExplicito = fueInformado(datosUsuario.impOpEx);
  const totalExplicito = fueInformado(datosUsuario.impTotal);

  let impNeto = redondear(netoExplicito
    ? parseFloat(datosUsuario.impNeto)
    : (esFacturaC ? totales.total : totales.totalNeto));
  let impIVA = redondear(ivaExplicito
    ? parseFloat(datosUsuario.impIVA)
    : (esFacturaC ? 0 : totales.totalIVA));
  let impOpEx = redondear(opExExplicito
    ? parseFloat(datosUsuario.impOpEx)
    : (esFacturaC ? 0 : totales.totalExento));

  // Factura C: emisor monotributista, sin discriminación de IVA
  if (esFacturaC) {
    impIVA = 0;
    if (totalExplicito) {
      impNeto = redondear(parseFloat(datosUsuario.impTotal));
    } else if (impNeto === 0 && totales.total > 0) {
      impNeto = totales.total;
    }
    if (!opExExplicito) impOpEx = 0;
  }

  const sumaComponentes = redondear(impNeto + impIVA + impTotConc + impOpEx + impTrib);
  const impTotal = totalExplicito
    ? redondear(parseFloat(datosUsuario.impTotal))
    : (esFacturaC ? impNeto : sumaComponentes);

  // Factura C no lleva array Iva. En A/B la alícuota sale de la línea.
  // Con importes ya guardados, el array cierra contra esa cabecera.
  let ivaFinal = [];
  if (!esFacturaC) {
    ivaFinal = (netoExplicito || ivaExplicito)
      ? alinearIvaACabecera(ivaAgrupado, impNeto, impIVA)
      : ivaAgrupado;
  }

  // 5. Construir objeto en formato ARCA
  const datosARCA = {
    CantReg: 1,
    PtoVta: puntoVenta,
    CbteTipo: datosUsuario.tipoComprobante,
    Concepto: datosUsuario.concepto || 1,
    DocTipo: datosUsuario.cliente.tipoDocumento,
    DocNro: parseInt(documentoFormateado) || 0,
    CbteDesde: numeroComprobante,
    CbteHasta: numeroComprobante,
    CbteFch: fecha,
    ImpTotal: impTotal,
    ImpTotConc: impTotConc,
    ImpNeto: impNeto,
    ImpOpEx: impOpEx,
    ImpIVA: impIVA,
    ImpTrib: impTrib,
    MonId: datosUsuario.moneda || 'PES',
    MonCotiz: datosUsuario.cotizacionMoneda || 1,
    CondicionIVAReceptorId: condicionIVAReceptor
  };

  if (ivaFinal.length > 0) {
    datosARCA.Iva = ivaFinal;
  }
  
  // 6. Agregar fechas de servicio si corresponde
  if (datosUsuario.fechaServicioDesde && datosUsuario.fechaServicioHasta) {
    datosARCA.FchServDesde = typeof datosUsuario.fechaServicioDesde === 'number' 
      ? datosUsuario.fechaServicioDesde 
      : dateAFormatoARCA(datosUsuario.fechaServicioDesde);
      
    datosARCA.FchServHasta = typeof datosUsuario.fechaServicioHasta === 'number'
      ? datosUsuario.fechaServicioHasta
      : dateAFormatoARCA(datosUsuario.fechaServicioHasta);
      
    datosARCA.FchVtoPago = datosARCA.FchServHasta;
  }

  if (esNotaCredito(datosUsuario.tipoComprobante) || esNotaDebito(datosUsuario.tipoComprobante)) {
  if (!datosUsuario.comprobantesAsociados || datosUsuario.comprobantesAsociados.length === 0) {
    const tipoNota = esNotaCredito(datosUsuario.tipoComprobante) ? 'Crédito' : 'Débito';
    throw new Error(`Las Notas de ${tipoNota} deben tener al menos un comprobante asociado`);
  }
  
  datosARCA.CbtesAsoc = formatearComprobantesAsociados(datosUsuario.comprobantesAsociados);
  const tipoNota = esNotaCredito(datosUsuario.tipoComprobante) ? 'Crédito' : 'Débito';
  console.log(`✅ ${datosARCA.CbtesAsoc.length} comprobante(s) asociado(s) a la Nota de ${tipoNota}`);
}
  
  // 7. Agregar tributos si existen
  if (datosUsuario.tributos && datosUsuario.tributos.length > 0) {
    datosARCA.Tributos = datosUsuario.tributos;
  }
  
  // 8. Agregar opcionales si existen
  if (datosUsuario.opcionales) {
    datosARCA.Opcionales = datosUsuario.opcionales;
  }
  
  return datosARCA;
}

export function formatearComprobantesAsociados(comprobantesAsociados) {
  if (!comprobantesAsociados || comprobantesAsociados.length === 0) {
    return [];
  }
  
  return comprobantesAsociados.map(comp => ({
    Tipo: parseInt(comp.tipo),
    PtoVta: parseInt(comp.puntoVenta),
    Nro: parseInt(comp.numero),
    // ✅ Campos opcionales según SDK
    Cuit: comp.cuit ? parseInt(comp.cuit) : undefined,
    CbteFch: comp.fecha ? parseInt(comp.fecha) : undefined
  }));
}

/**
 * Formatear respuesta de ARCA para el usuario
 */
export function formatearRespuestaARCA(respuestaARCA, datosOriginal) {
  return {
    exito: true,
    comprobante: {
      numero: respuestaARCA.voucher_number || datosOriginal.CbteDesde,
      puntoVenta: datosOriginal.PtoVta,
      tipo: datosOriginal.CbteTipo,
      fecha: formatearFecha(datosOriginal.CbteFch),
      total: datosOriginal.ImpTotal
    },
    autorizacion: {
      cae: respuestaARCA.CAE,
      fechaVencimiento: respuestaARCA.CAEFchVto,
      resultado: respuestaARCA.Resultado || 'A'
    },
    cliente: {
      tipoDocumento: datosOriginal.DocTipo,
      numeroDocumento: datosOriginal.DocNro,
      condicionIVA: datosOriginal.CondicionIVAReceptorId
    },
    importes: {
      neto: datosOriginal.ImpNeto,
      iva: datosOriginal.ImpIVA,
      total: datosOriginal.ImpTotal
    }
  };
}

export default {
  obtenerFechaActual,
  formatearFecha,
  dateAFormatoARCA,
  redondear,
  calcularIVA,
  calcularPrecioTotal,
  agruparIVAPorAlicuota,
  calcularTotales,
  formatearDocumento,
  transformarAFormatoARCA,
  formatearRespuestaARCA,
  formatearComprobantesAsociados 
};