const { obtenerWhatsAppClienteParaPedido } = require('../services/whatsappClienteAlLocalService');

const obtenerWhatsAppClientePedido = async (req, res) => {
    const startedAt = Date.now();
    const pedidoId = Number.parseInt(String(req.params.pedidoId ?? ''), 10);

    try {
        if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Identificador de pedido inválido',
            });
        }

        const data = await obtenerWhatsAppClienteParaPedido(pedidoId);
        const durationMs = Date.now() - startedAt;

        console.log(
            `[WA_CLIENTE] pedidoId=${pedidoId} activo=${Boolean(data?.activo)}` +
            ` motivo=${data?.motivo || (data?.activo ? 'ok' : 'desconocido')}` +
            ` durationMs=${durationMs}`
        );

        return res.json({
            success: true,
            ...data,
        });
    } catch (error) {
        console.error(
            `[WA_CLIENTE] Error pedidoId=${Number.isFinite(pedidoId) ? pedidoId : 'n/a'}` +
            ` durationMs=${Date.now() - startedAt}:`,
            error
        );
        return res.status(500).json({
            success: false,
            message: 'Error al obtener enlace de WhatsApp',
            motivo: 'error_servidor',
        });
    }
};

module.exports = {
    obtenerWhatsAppClientePedido,
};
