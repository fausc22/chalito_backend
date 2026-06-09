const db = require('./dbPromise');
const {
    crearCheckoutMercadoPago,
    procesarWebhookMercadoPago,
    obtenerEstadoPagoPedidoCartaPublica,
    obtenerEstadoSesionMp
} = require('../services/CartaPublicaMercadoPagoCheckoutService');
const { buildPedidoSnapshotById } = require('../services/pedidoRealtimeSerializer');

async function crearCheckoutMercadoPagoController(req, res) {
    try {
        const payload = req.validatedData;
        const resultado = await crearCheckoutMercadoPago(db, payload);

        if (!resultado.ok) {
            console.error('⚠️ Checkout MP sin preferencia:', resultado.error?.message);
            return res.status(502).json({
                ok: false,
                mensaje: 'No se pudo iniciar el pago con Mercado Pago. Intentá nuevamente en unos minutos.',
                data: resultado.data
            });
        }

        return res.status(201).json({
            ok: true,
            mensaje: 'Sesión de pago creada. Redirigiendo a Mercado Pago.',
            data: resultado.data
        });
    } catch (error) {
        console.error('❌ Error en checkout Mercado Pago:', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Error al crear el checkout de Mercado Pago.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

async function obtenerEstadoPagoPedidoController(req, res) {
    try {
        const resultado = await obtenerEstadoPagoPedidoCartaPublica(db, req.params.pedidoId);

        if (!resultado.encontrado) {
            if (resultado.motivo === 'id_invalido') {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Identificador de pedido inválido.'
                });
            }
            return res.status(404).json({
                ok: false,
                mensaje: 'Pedido no encontrado.'
            });
        }

        return res.status(200).json({
            ok: true,
            data: resultado.data
        });
    } catch (error) {
        console.error('❌ Error al consultar estado de pago (carta):', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Error al consultar el estado del pago.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

async function obtenerEstadoSesionMpController(req, res) {
    try {
        const resultado = await obtenerEstadoSesionMp(db, req.params.sessionId);

        if (!resultado.encontrado) {
            if (resultado.motivo === 'id_invalido') {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Identificador de sesión inválido.'
                });
            }
            return res.status(404).json({
                ok: false,
                mensaje: 'Sesión de pago no encontrada.'
            });
        }

        return res.status(200).json({
            ok: true,
            data: resultado.data
        });
    } catch (error) {
        console.error('❌ Error al consultar estado de sesión MP:', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Error al consultar el estado de la sesión.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

async function emitirSocketPostWebhook(io, resultado) {
    if (!io || !resultado?.procesado || !resultado?.pedidoId) {
        return;
    }
    try {
        const { getInstance: getSocketService } = require('../services/SocketService');
        const socketService = getSocketService(io);
        const snapshot = await buildPedidoSnapshotById({
            pedidoId: resultado.pedidoId,
            connection: db,
            includeArticulos: true
        });
        if (!snapshot) {
            return;
        }
        if (resultado.esPagoNuevo) {
            socketService.emitPedidoCreado(snapshot);
        } else if (resultado.pagoRecienConfirmadoLegacy) {
            socketService.emitPedidoActualizado(resultado.pedidoId, snapshot);
        }
    } catch (socketError) {
        console.warn(
            `⚠️ Error emitiendo socket post-webhook MP pedido #${resultado.pedidoId}:`,
            socketError.message
        );
    }
}

async function aplicarAutoCobroPostMp(io, resultado) {
    const estado = String(resultado?.estadoPagoInterno || '').toUpperCase();
    if (
        !resultado?.pedidoId ||
        estado !== 'PAGADO' ||
        (!resultado.esPagoNuevo && !resultado.pagoRecienConfirmadoLegacy)
    ) {
        return resultado;
    }
    try {
        const { procesarAprobacionMercadoPago } = require('../services/PedidoPostPagoService');
        const auto = await procesarAprobacionMercadoPago({
            pedidoId: resultado.pedidoId,
            paymentId: resultado.paymentId,
            resumenPagoMp: resultado.resumenPagoMp,
            io
        });
        if (auto.success && auto.pedido) {
            resultado.autoCobroSnapshot = { ventaId: auto.ventaId, pedido: auto.pedido };
        }
    } catch (err) {
        console.error(`❌ [MP] Auto-cobro pedido #${resultado.pedidoId}:`, err.message);
    }
    return resultado;
}

async function webhookMercadoPagoController(req, res) {
    try {
        let resultado = await procesarWebhookMercadoPago(db, req);
        const io = req.app.get('io');
        resultado = await aplicarAutoCobroPostMp(io, resultado);
        await emitirSocketPostWebhook(io, resultado);

        return res.status(200).json({
            ok: true,
            mensaje: 'Webhook recibido.',
            data: resultado
        });
    } catch (error) {
        console.error('❌ Error procesando webhook de Mercado Pago:', {
            message: error.message,
            stack: error.stack
        });
        return res.status(200).json({
            ok: false,
            mensaje: 'Webhook recibido con error interno.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

module.exports = {
    crearCheckoutMercadoPagoController,
    obtenerEstadoPagoPedidoController,
    obtenerEstadoSesionMpController,
    webhookMercadoPagoController
};
