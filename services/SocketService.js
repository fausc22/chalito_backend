/**
 * Servicio para gestionar eventos WebSocket
 * Fase 3: WebSockets para tiempo real
 */

class SocketService {
    constructor(io) {
        this.io = io;
        this.connectedClients = new Map();
    }

    /**
     * Emitir evento cuando un pedido cambia de estado
     */
    emitPedidoEstadoCambiado(pedidoId, estadoAnterior, estadoNuevo, pedidoData = null) {
        if (this.io) {
            this.io.emit('pedido:estado-cambiado', {
                pedidoId,
                estadoAnterior,
                estadoNuevo,
                pedido: pedidoData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedido:estado-cambiado - Pedido #${pedidoId} ${estadoAnterior} → ${estadoNuevo}`);
        }
    }

    /**
     * Emitir evento cuando se crea un nuevo pedido
     */
    emitPedidoCreado(pedidoData) {
        if (this.io) {
            this.io.emit('pedido:creado', {
                pedido: pedidoData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedido:creado - Pedido #${pedidoData.id}`);
        }
    }

    /**
     * Emitir evento cuando cambia la capacidad de cocina
     */
    emitCapacidadActualizada(infoCapacidad) {
        if (this.io) {
            this.io.emit('capacidad:actualizada', {
                capacidad: infoCapacidad,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: capacidad:actualizada - ${infoCapacidad.pedidosEnPreparacion}/${infoCapacidad.capacidadMaxima}`);
        }
    }

    /**
     * Emitir evento cuando hay pedidos atrasados
     */
    emitPedidosAtrasados(pedidosAtrasados) {
        if (this.io && pedidosAtrasados && pedidosAtrasados.length > 0) {
            this.io.emit('pedidos:atrasados', {
                pedidos: pedidosAtrasados,
                cantidad: pedidosAtrasados.length,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedidos:atrasados - ${pedidosAtrasados.length} pedido(s)`);
        }
    }

    /**
     * Emitir evento cuando un pedido es cobrado
     */
    emitPedidoCobrado(pedidoId, ventaId, pedidoData = null) {
        if (this.io) {
            this.io.emit('pedido:cobrado', {
                pedidoId,
                ventaId,
                pedido: pedidoData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedido:cobrado - Pedido #${pedidoId} - Venta #${ventaId}`);
        }
    }

    /**
     * Emitir evento cuando un pedido es entregado
     */
    emitPedidoEntregado(pedidoId, pedidoData = null) {
        if (this.io) {
            this.io.emit('pedido:entregado', {
                pedidoId,
                pedido: pedidoData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedido:entregado - Pedido #${pedidoId}`);
        }
    }

    /**
     * Emitir evento cuando un pedido es actualizado/editado
     */
    emitPedidoActualizado(pedidoId, pedidoData = null) {
        if (this.io) {
            this.io.emit('pedido:actualizado', {
                pedidoId,
                pedido: pedidoData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: pedido:actualizado - Pedido #${pedidoId}`);
        }
    }

    /**
     * Evento de dominio para actualizaciones de pago Mercado Pago.
     */
    emitMpPaymentUpdated(payload = {}) {
        if (this.io) {
            this.io.emit('mp:payment-updated', {
                ...payload,
                timestamp: new Date().toISOString()
            });
            console.log(
                `📡 [SocketService] Evento emitido: mp:payment-updated - pedido #${payload.pedidoId ?? 'n/a'}`
            );
        }
    }

    /**
     * Emitir evento cuando se crea una venta (ej: al cobrar un pedido)
     */
    emitVentaCreada(ventaId, ventaData = null) {
        if (this.io) {
            this.io.emit('venta:creada', {
                ventaId,
                venta: ventaData,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: venta:creada - Venta #${ventaId}`);
        }
    }

    emitVentaCaeObtenido(ventaId, data = null) {
        if (this.io) {
            this.io.emit('venta:cae-obtenido', {
                ventaId,
                data,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SocketService] Evento emitido: venta:cae-obtenido - Venta #${ventaId}`);
        }
    }

    /**
     * Registrar conexión de cliente
     */
    registrarCliente(socketId, userId = null) {
        this.connectedClients.set(socketId, {
            userId,
            connectedAt: new Date(),
            lastActivity: new Date()
        });
        console.log(`✅ [SocketService] Cliente conectado: ${socketId}${userId ? ` (Usuario: ${userId})` : ''}`);
    }

    /**
     * Desregistrar cliente desconectado
     */
    desregistrarCliente(socketId) {
        this.connectedClients.delete(socketId);
        console.log(`🔌 [SocketService] Cliente desconectado: ${socketId}`);
    }

    /**
     * Obtener número de clientes conectados
     */
    obtenerClientesConectados() {
        return this.connectedClients.size;
    }
}

// Singleton
let socketServiceInstance = null;

module.exports = {
    getInstance: (io) => {
        if (!socketServiceInstance && io) {
            socketServiceInstance = new SocketService(io);
        }
        return socketServiceInstance;
    },
    SocketService
};








