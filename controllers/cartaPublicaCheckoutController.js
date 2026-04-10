const db = require('./dbPromise');
const {
    crearCheckoutMercadoPago,
    procesarWebhookMercadoPago,
    obtenerEstadoPagoPedidoCartaPublica
} = require('../services/CartaPublicaMercadoPagoCheckoutService');

async function crearCheckoutMercadoPagoController(req, res) {
    try {
        const payload = req.validatedData;
        const resultado = await crearCheckoutMercadoPago(db, payload);

        if (!resultado.ok) {
            console.error('⚠️ Pedido creado sin preferencia MP:', resultado.error?.message);
            return res.status(502).json({
                ok: false,
                mensaje: 'Pedido creado, pero no se pudo generar la preferencia de pago. Intentá nuevamente en unos minutos.',
                data: resultado.data
            });
        }

        return res.status(201).json({
            ok: true,
            mensaje: 'Pedido creado y preferencia de pago generada correctamente.',
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

async function webhookMercadoPagoController(req, res) {
    try {
        const resultado = await procesarWebhookMercadoPago(db, req);

        if (resultado?.procesado && resultado?.pedidoId) {
            const io = req.app.get('io');
            if (io) {
                try {
                    const [pedidoRows] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [resultado.pedidoId]);
                    if (pedidoRows.length > 0) {
                        const { getInstance: getSocketService } = require('../services/SocketService');
                        const socketService = getSocketService(io);
                        socketService.emitPedidoActualizado(resultado.pedidoId, pedidoRows[0]);
                    }
                } catch (socketError) {
                    console.warn(`⚠️ Error emitiendo socket de pago actualizado para pedido #${resultado.pedidoId}:`, socketError.message);
                }
            }
        }

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
    webhookMercadoPagoController
};
