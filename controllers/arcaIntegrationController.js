const { solicitarCaeParaVenta } = require('../services/ArcaFacturacionService');
const { getBillingController } = require('../lib/billingControllerLoader');

const verificarARCA = async (req, res, next) => {
  const billingController = await getBillingController();
  if (!billingController) {
    return res.status(503).json({
      success: false,
      message: 'Servicio ARCA no disponible. Intente nuevamente en unos segundos.'
    });
  }
  req.billingController = billingController;
  next();
};

const solicitarCAE = async (req, res) => {
  const { ventaId } = req.body;
  if (!ventaId) {
    return res.status(400).json({ success: false, message: 'ventaId es requerido' });
  }
  try {
    const io = req.app.get('io');
    const result = await solicitarCaeParaVenta(ventaId, io);
    if (!result.success) {
      return res.status(result.existing ? 200 : 500).json({
        success: result.existing === true,
        message: result.message || result.error || 'Error al solicitar CAE',
        data: result
      });
    }
    return res.json({
      success: true,
      message: result.existing ? 'La venta ya tenía CAE' : 'CAE obtenido exitosamente',
      data: {
        ventaId,
        autorizacion: { cae: result.cae, fechaVencimiento: result.cae_fecha },
        comprobante: { numero: result.numero_factura }
      }
    });
  } catch (error) {
    console.error('❌ solicitarCAE:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al solicitar CAE',
      error: error.message
    });
  }
};

const solicitarCAEBatch = async (req, res) => {
  const { ventasIds } = req.body;
  if (!Array.isArray(ventasIds) || !ventasIds.length) {
    return res.status(400).json({ success: false, message: 'ventasIds debe ser un array no vacío' });
  }
  const exitosas = [];
  const errores = [];
  const io = req.app.get('io');
  for (const ventaId of ventasIds) {
    const result = await solicitarCaeParaVenta(ventaId, io);
    if (result.success) {
      exitosas.push({ ventaId, data: result });
    } else {
      errores.push({ ventaId, error: result.message || result.error });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return res.json({
    success: errores.length === 0,
    message: `Procesadas ${ventasIds.length}: ${exitosas.length} OK, ${errores.length} error`,
    data: { exitosas, errores, total: ventasIds.length }
  });
};

const healthCheck = async (req, res) => {
  try {
    const billingController = await getBillingController();
    if (!billingController) {
      return res.status(503).json({ success: false, message: 'Servicio ARCA no disponible' });
    }
    const mockReq = {};
    const mockRes = {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    await billingController.verificarSalud(mockReq, mockRes);
    return res.json({ success: true, message: 'Servicio ARCA operativo', data: mockRes.jsonData });
  } catch (error) {
    return res.status(503).json({ success: false, message: error.message });
  }
};

module.exports = {
  verificarARCA,
  solicitarCAE,
  solicitarCAEBatch,
  healthCheck
};
