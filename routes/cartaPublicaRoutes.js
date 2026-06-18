/**
 * Rutas públicas para la carta online (sin autenticación).
 * Solo lectura de catálogo: categorías, artículos, adicionales.
 * Creación de pedidos desde carta: POST /carta-publica/pedidos
 * Las imágenes se sirven vía proxy con cache HTTP fuerte.
 */
const express = require('express');
const router = express.Router();
const {
  obtenerCategorias,
  obtenerArticulos,
  obtenerArticuloPorId,
  obtenerAdicionalesPorArticulo,
  proxyImagenArticulo,
} = require('../controllers/articulosController');
const { crearPedidoCarta } = require('../controllers/cartaPublicaPedidosController');
const { validarCuponCarta } = require('../controllers/cartaPublicaCuponesController');
const { obtenerEstadoPublico } = require('../controllers/tiendaOnlineController');
const { obtenerBrandingPublico } = require('../controllers/cartaPublicaBrandingController');
const {
  crearCheckoutMercadoPagoController,
  obtenerEstadoPagoPedidoController,
  obtenerEstadoSesionMpController,
  reconciliarSesionMpController,
  webhookMercadoPagoController
} = require('../controllers/cartaPublicaCheckoutController');
const {
  verificarFirmaWebhookMp,
  verificarTimestampWebhookMp
} = require('../middlewares/webhookSignatureMiddleware');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');
const {
  crearPedidoCartaSchema,
  checkoutMercadoPagoSchema,
  validarCuponSchema,
  validate
} = require('../validators/cartaPublicaPedidosValidators');

/** Añade imagen_url_cacheable (URL estable para cache) a artículos */
const addCacheableImageUrl = (articulo) => ({
  ...articulo,
  imagen_url_cacheable: articulo.imagen_url ? `/carta-publica/imagenes/${articulo.id}` : null,
});

// GET /carta-publica/imagenes/:articuloId - Proxy con cache HTTP fuerte (estable, sin query params)
router.get('/imagenes/:articuloId', apiRateLimiter, proxyImagenArticulo);

// GET /carta-publica/categorias
router.get('/categorias', apiRateLimiter, (req, res) => {
  req.query.solo_visible_carta = 'true';
  return obtenerCategorias(req, res);
});

// GET /carta-publica/articulos?categoria=X&disponible=true
router.get('/articulos', apiRateLimiter, async (req, res) => {
  req.query.solo_visible_carta = 'true';
  const origJson = res.json.bind(res);
  res.json = (data) => {
    const transformed = Array.isArray(data) ? data.map(addCacheableImageUrl) : data;
    origJson(transformed);
  };
  return obtenerArticulos(req, res);
});

// GET /carta-publica/articulos/:id/adicionales (debe ir antes de /:id)
router.get('/articulos/:id/adicionales', apiRateLimiter, obtenerAdicionalesPorArticulo);

// GET /carta-publica/articulos/:id
router.get('/articulos/:id', apiRateLimiter, async (req, res) => {
  const origJson = res.json.bind(res);
  res.json = (data) => {
    const transformed = data && typeof data === 'object' ? addCacheableImageUrl(data) : data;
    origJson(transformed);
  };
  return obtenerArticuloPorId(req, res);
});

// GET /carta-publica/estado-tienda - Estado abierto/cerrado del canal online (público)
router.get('/estado-tienda', apiRateLimiter, obtenerEstadoPublico);

// GET /carta-publica/branding - Nombre, logo y colores web (público)
router.get('/branding', apiRateLimiter, obtenerBrandingPublico);

// POST /carta-publica/cupones/validar - Preview de cupón (sin redimir)
router.post('/cupones/validar', apiRateLimiter, validate(validarCuponSchema), validarCuponCarta);

// POST /carta-publica/pedidos - Crear pedido desde carta online (público)
router.post('/pedidos', apiRateLimiter, validate(crearPedidoCartaSchema), crearPedidoCarta);

// GET /carta-publica/pedidos/:pedidoId/estado-pago - Estado de pago post-checkout (público, solo pedidos WEB)
router.get('/pedidos/:pedidoId/estado-pago', apiRateLimiter, obtenerEstadoPagoPedidoController);

// POST /carta-publica/checkout/mercadopago - Sesión de pago + preferencia Checkout Pro (pedido tras aprobación)
router.post('/checkout/mercadopago', apiRateLimiter, validate(checkoutMercadoPagoSchema), crearCheckoutMercadoPagoController);

// GET /carta-publica/checkout/sesion/:sessionId/estado - Estado de sesión MP (polling post-checkout)
router.get('/checkout/sesion/:sessionId/estado', apiRateLimiter, obtenerEstadoSesionMpController);

// POST /carta-publica/checkout/sesion/:sessionId/reconciliar - Reconciliación activa contra API MP
router.post('/checkout/sesion/:sessionId/reconciliar', apiRateLimiter, reconciliarSesionMpController);

// POST /carta-publica/checkout/mercadopago/webhook - Webhook de Mercado Pago (firma HMAC)
router.post(
  '/checkout/mercadopago/webhook',
  verificarTimestampWebhookMp(300),
  verificarFirmaWebhookMp(),
  webhookMercadoPagoController
);

module.exports = router;
