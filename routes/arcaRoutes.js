const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { readConfiguracion, writeConfiguracion } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const { middlewareAuditoria } = require('../middlewares/auditoriaMiddleware');
const { getBillingController } = require('../lib/billingControllerLoader');

const arcaIntegrationController = require('../controllers/arcaIntegrationController');

const verificarControlador = async (req, res, next) => {
  const billingController = await getBillingController();
  if (!billingController) {
    return res.status(503).json({
      success: false,
      error: 'Servicio ARCA no disponible. Intente nuevamente en unos segundos.'
    });
  }
  req.billingController = billingController;
  next();
};

const withBillingHandler = (handlerName) => async (req, res) => {
  const billingController = req.billingController || (await getBillingController());
  if (!billingController || typeof billingController[handlerName] !== 'function') {
    return res.status(503).json({
      success: false,
      error: 'Servicio ARCA no disponible. Intente nuevamente en unos segundos.'
    });
  }
  return billingController[handlerName](req, res);
};

// ============================================
// RUTAS DE INTEGRACIÓN (PRINCIPALES)
// ============================================

router.post('/solicitar-cae',
  apiRateLimiter,
  ...writeConfiguracion,
  middlewareAuditoria({ accion: 'INSERT', tabla: 'ventas', incluirBody: true }),
  arcaIntegrationController.verificarARCA,
  arcaIntegrationController.solicitarCAE
);

router.post('/solicitar-cae-batch',
  apiRateLimiter,
  ...writeConfiguracion,
  middlewareAuditoria({ accion: 'INSERT', tabla: 'ventas', incluirBody: true }),
  arcaIntegrationController.verificarARCA,
  arcaIntegrationController.solicitarCAEBatch
);

router.get('/health',
  arcaIntegrationController.healthCheck
);

// ============================================
// RUTAS DEL MICROSERVICIO ARCA (DIRECTAS)
// ============================================

router.post('/facturas/consumidor-final',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  async (req, res) => withBillingHandler('crearFacturaConsumidorFinal')(req, res)
);

router.post('/facturas/responsable-inscripto',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  async (req, res) => withBillingHandler('crearFacturaResponsableInscripto')(req, res)
);

router.get('/tipos-comprobante',
  apiRateLimiter,
  ...readConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('obtenerTiposComprobante')(req, res)
);

router.get('/alicuotas-iva',
  apiRateLimiter,
  ...readConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('obtenerAlicuotasIVA')(req, res)
);

router.get('/condiciones-iva',
  apiRateLimiter,
  ...readConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('obtenerCondicionesIVA')(req, res)
);

router.post('/generar-qr',
  apiRateLimiter,
  ...readConfiguracion,
  async (req, res) => {
    try {
      const datosQR = req.body;

      const camposRequeridos = ['ver', 'fecha', 'cuit', 'ptoVta', 'tipoCmp', 'nroCmp', 'importe', 'moneda', 'ctz', 'tipoCodAut', 'codAut'];
      const camposFaltantes = camposRequeridos.filter((campo) => !Object.prototype.hasOwnProperty.call(datosQR, campo));

      if (camposFaltantes.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Faltan datos obligatorios: ${camposFaltantes.join(', ')}`
        });
      }

      const jsonComprobante = {
        ver: parseInt(datosQR.ver, 10),
        fecha: datosQR.fecha,
        cuit: parseInt(datosQR.cuit, 10),
        ptoVta: parseInt(datosQR.ptoVta, 10),
        tipoCmp: parseInt(datosQR.tipoCmp, 10),
        nroCmp: parseInt(datosQR.nroCmp, 10),
        importe: parseFloat(datosQR.importe),
        moneda: datosQR.moneda,
        ctz: parseFloat(datosQR.ctz),
        tipoDocRec: parseInt(datosQR.tipoDocRec, 10),
        nroDocRec: parseInt(datosQR.nroDocRec, 10),
        tipoCodAut: datosQR.tipoCodAut,
        codAut: parseInt(datosQR.codAut, 10)
      };

      const jsonString = JSON.stringify(jsonComprobante);
      const base64Data = Buffer.from(jsonString, 'utf8').toString('base64');
      const qrUrl = `https://www.arca.gob.ar/fe/qr/?p=${base64Data}`;

      const qrBase64 = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 200,
        margin: 1
      });

      res.json({
        success: true,
        qrBase64,
        qrUrl,
        qrData: jsonComprobante
      });
    } catch (error) {
      console.error('❌ Error generando QR:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando código QR',
        details: error.message
      });
    }
  }
);

router.post('/notas-credito/tipo-a',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaCreditoA')(req, res)
);

router.post('/notas-credito/tipo-b',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaCreditoB')(req, res)
);

router.post('/notas-credito',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaCreditoGeneral')(req, res)
);

router.post('/notas-debito/tipo-a',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaDebitoA')(req, res)
);

router.post('/notas-debito/tipo-b',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaDebitoB')(req, res)
);

router.post('/notas-debito',
  apiRateLimiter,
  ...writeConfiguracion,
  verificarControlador,
  (req, res) => withBillingHandler('crearNotaDebitoGeneral')(req, res)
);

module.exports = router;
