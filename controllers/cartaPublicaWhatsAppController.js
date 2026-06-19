const { obtenerWhatsAppClienteParaPedido } = require('../services/whatsappClienteAlLocalService');

const obtenerWhatsAppClientePedido = async (req, res) => {
    try {
        const pedidoId = Number.parseInt(String(req.params.pedidoId ?? ''), 10);
        if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Identificador de pedido inválido',
            });
        }

        const data = await obtenerWhatsAppClienteParaPedido(pedidoId);

        return res.json({
            success: true,
            ...data,
        });
    } catch (error) {
        console.error('Error obteniendo WhatsApp cliente->local:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener enlace de WhatsApp',
        });
    }
};

module.exports = {
    obtenerWhatsAppClientePedido,
};
