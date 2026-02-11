/**
 * Servicio de Impresión
 * 
 * Centraliza la lógica para preparar datos de impresión de:
 * - Comandas (impresión de cocina)
 * - Tickets/Facturas (impresión de venta)
 * 
 * @module services/PrintService
 */

const db = require('../controllers/dbPromise');

/**
 * Obtener datos para imprimir comanda
 * La comanda puede imprimirse en cualquier estado del pedido
 * 
 * @param {number} pedidoId - ID del pedido
 * @returns {Promise<Object>} Datos formateados para impresión de comanda
 */
const obtenerDatosComanda = async (pedidoId) => {
    try {
        // Obtener pedido
        const [pedidos] = await db.execute(
            'SELECT * FROM pedidos WHERE id = ?',
            [pedidoId]
        );

        if (pedidos.length === 0) {
            throw new Error(`Pedido ${pedidoId} no encontrado`);
        }

        const pedido = pedidos[0];

        // Obtener comanda asociada (si existe)
        const [comandas] = await db.execute(
            'SELECT * FROM comandas WHERE pedido_id = ?',
            [pedidoId]
        );

        const comanda = comandas.length > 0 ? comandas[0] : null;

        // Obtener artículos del pedido
        const [articulos] = await db.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ? ORDER BY id',
            [pedidoId]
        );

        if (articulos.length === 0) {
            throw new Error(`El pedido ${pedidoId} no tiene artículos`);
        }

        // Calcular tiempo de entrega
        let tiempoTexto = null;
        let tiempoAtrasoMinutos = null;
        
        if (pedido.horario_entrega) {
            // Pedido programado
            const horarioEntrega = new Date(pedido.horario_entrega);
            const ahora = new Date();
            
            if (horarioEntrega < ahora) {
                // Atrasado
                tiempoAtrasoMinutos = Math.floor((ahora - horarioEntrega) / (1000 * 60));
                tiempoTexto = `ATRASADO ${tiempoAtrasoMinutos}m`;
            } else {
                // Programado (aún no llegó la hora)
                const horas = horarioEntrega.getHours().toString().padStart(2, '0');
                const minutos = horarioEntrega.getMinutes().toString().padStart(2, '0');
                tiempoTexto = `Para ${horas}:${minutos}`;
            }
        } else {
            // Pedido "cuanto antes"
            // Verificar si está atrasado basado en hora_inicio_preparacion y tiempo_estimado
            if (pedido.hora_inicio_preparacion && pedido.tiempo_estimado_preparacion) {
                const horaInicio = new Date(pedido.hora_inicio_preparacion);
                const horaEsperada = new Date(horaInicio.getTime() + (pedido.tiempo_estimado_preparacion * 60 * 1000));
                const ahora = new Date();
                
                if (ahora > horaEsperada) {
                    tiempoAtrasoMinutos = Math.floor((ahora - horaEsperada) / (1000 * 60));
                    tiempoTexto = `ATRASADO ${tiempoAtrasoMinutos}m`;
                } else {
                    tiempoTexto = 'CUANTO ANTES';
                }
            } else {
                tiempoTexto = 'CUANTO ANTES';
            }
        }

        // Formatear artículos con personalizaciones
        const items = articulos.map(articulo => {
            let extras = [];
            
            if (articulo.personalizaciones) {
                try {
                    const personalizaciones = typeof articulo.personalizaciones === 'string'
                        ? JSON.parse(articulo.personalizaciones)
                        : articulo.personalizaciones;
                    
                    if (personalizaciones && typeof personalizaciones === 'object') {
                        // Si tiene estructura { extras: [...] }
                        if (personalizaciones.extras && Array.isArray(personalizaciones.extras)) {
                            extras = personalizaciones.extras.map(extra => ({
                                nombre: extra.nombre || extra.nombre_adicional || extra.id,
                                precio: parseFloat(extra.precio || extra.precio_adicional || 0)
                            }));
                        } else {
                            // Formato legacy: object plano
                            for (const [key, value] of Object.entries(personalizaciones)) {
                                if (value && typeof value === 'object' && value.nombre) {
                                    extras.push({
                                        nombre: value.nombre || key,
                                        precio: parseFloat(value.precio || 0)
                                    });
                                } else if (value) {
                                    extras.push({
                                        nombre: key,
                                        precio: 0
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Error parseando personalizaciones:', e);
                }
            }

            return {
                articulo_id: articulo.articulo_id,
                nombre: articulo.articulo_nombre || articulo.nombre,
                cantidad: articulo.cantidad,
                extras: extras.length > 0 ? extras : null,
                observaciones: articulo.observaciones || null
            };
        });

        // Preparar datos para impresión
        const datosComanda = {
            // Datos del negocio (se pueden obtener de configuración si existe)
            negocio: {
                nombre: process.env.NOMBRE_NEGOCIO || 'El Chalito',
                direccion: process.env.DIRECCION_NEGOCIO || '',
                telefono: process.env.TELEFONO_NEGOCIO || ''
            },
            
            // Datos del pedido/comanda
            pedido: {
                numero: pedido.id,
                fecha: pedido.fecha,
                hora: new Date(pedido.fecha).toLocaleTimeString('es-AR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                })
            },
            
            // Datos del cliente
            cliente: {
                nombre: pedido.cliente_nombre || 'MOSTRADOR',
                direccion: pedido.cliente_direccion || null,
                telefono: pedido.cliente_telefono || null,
                email: pedido.cliente_email || null
            },
            
            // Tipo y tiempo
            tipo: pedido.modalidad, // DELIVERY o RETIRO
            tiempo: tiempoTexto,
            tiempo_atraso_minutos: tiempoAtrasoMinutos,
            
            // Items
            items: items,
            
            // Estado de pago
            estado_pago: pedido.estado_pago || 'DEBE',
            
            // Estado del pedido (la comanda no tiene estado propio)
            estado_pedido: pedido.estado,
            
            // Observaciones
            observaciones: pedido.observaciones || null
        };

        return datosComanda;
    } catch (error) {
        console.error('❌ Error obteniendo datos de comanda para impresión:', error);
        throw error;
    }
};

/**
 * Buscar venta asociada a un pedido
 * La venta se busca por coincidencia de datos (cliente, fecha, total)
 * 
 * @param {number} pedidoId - ID del pedido
 * @returns {Promise<Object|null>} Venta encontrada o null
 */
const buscarVentaAsociada = async (pedidoId) => {
    try {
        // Primero intentar por pedido_id (asociación explícita cuando la columna existe)
        try {
            const [ventasPorPedido] = await db.execute(
                'SELECT * FROM ventas WHERE pedido_id = ? AND estado = ? ORDER BY fecha DESC LIMIT 1',
                [pedidoId, 'FACTURADA']
            );
            if (ventasPorPedido.length > 0) {
                return ventasPorPedido[0];
            }
        } catch (err) {
            // Columna pedido_id puede no existir en BD antigua - fallback a búsqueda heurística
        }

        // Obtener pedido para búsqueda heurística
        const [pedidos] = await db.execute(
            'SELECT * FROM pedidos WHERE id = ?',
            [pedidoId]
        );

        if (pedidos.length === 0) {
            return null;
        }

        const pedido = pedidos[0];

        // Búsqueda heurística: mismo cliente, misma fecha (día), total similar
        const [ventas] = await db.execute(`
            SELECT * FROM ventas
            WHERE DATE(fecha) = DATE(?)
              AND (
                cliente_nombre = ? 
                OR cliente_telefono = ?
              )
              AND ABS(total - ?) < 0.01
              AND estado = 'FACTURADA'
            ORDER BY fecha DESC
            LIMIT 1
        `, [
            pedido.fecha,
            pedido.cliente_nombre,
            pedido.cliente_telefono,
            pedido.total
        ]);

        return ventas.length > 0 ? ventas[0] : null;
    } catch (error) {
        console.error('❌ Error buscando venta asociada:', error);
        throw error;
    }
};

/**
 * Obtener datos para imprimir ticket/factura
 * Solo puede imprimirse si el pedido está PAGADO y existe una venta asociada
 * 
 * @param {number} pedidoId - ID del pedido
 * @returns {Promise<Object>} Datos formateados para impresión de ticket/factura
 */
const obtenerDatosTicket = async (pedidoId) => {
    try {
        // Obtener pedido
        const [pedidos] = await db.execute(
            'SELECT * FROM pedidos WHERE id = ?',
            [pedidoId]
        );

        if (pedidos.length === 0) {
            throw new Error(`Pedido ${pedidoId} no encontrado`);
        }

        const pedido = pedidos[0];

        // Validar que el pedido esté pagado
        if (pedido.estado_pago !== 'PAGADO') {
            throw new Error(`El pedido ${pedidoId} no está pagado. Estado actual: ${pedido.estado_pago || 'DEBE'}`);
        }

        // Buscar venta asociada
        const venta = await buscarVentaAsociada(pedidoId);

        if (!venta) {
            throw new Error(`No existe una venta asociada al pedido ${pedidoId}`);
        }

        // Obtener artículos de la venta
        const [articulosVenta] = await db.execute(
            'SELECT * FROM ventas_contenido WHERE venta_id = ? ORDER BY id',
            [venta.id]
        );

        if (articulosVenta.length === 0) {
            throw new Error(`La venta ${venta.id} no tiene artículos`);
        }

        // Formatear artículos
        const items = articulosVenta.map(articulo => ({
            articulo_id: articulo.articulo_id,
            nombre: articulo.articulo_nombre,
            cantidad: articulo.cantidad,
            precio: parseFloat(articulo.precio),
            subtotal: parseFloat(articulo.subtotal)
        }));

        // Preparar datos para impresión
        const datosTicket = {
            // Datos del negocio
            negocio: {
                nombre: process.env.NOMBRE_NEGOCIO || 'El Chalito',
                direccion: process.env.DIRECCION_NEGOCIO || '',
                telefono: process.env.TELEFONO_NEGOCIO || '',
                cuit: process.env.CUIT_NEGOCIO || ''
            },
            
            // Datos de la venta
            venta: {
                numero: venta.id,
                fecha: venta.fecha,
                hora: new Date(venta.fecha).toLocaleTimeString('es-AR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                tipo_factura: venta.tipo_factura || null,
                cae_id: venta.cae_id || null,
                cae_fecha: venta.cae_fecha || null
            },
            
            // Referencia al pedido
            pedido: {
                numero: pedido.id
            },
            
            // Datos del cliente
            cliente: {
                nombre: venta.cliente_nombre || 'Cliente',
                direccion: venta.cliente_direccion || null,
                telefono: venta.cliente_telefono || null,
                email: venta.cliente_email || null
            },
            
            // Items
            items: items,
            
            // Totales
            subtotal: parseFloat(venta.subtotal),
            iva_total: parseFloat(venta.iva_total),
            descuento: parseFloat(venta.descuento || 0),
            total: parseFloat(venta.total),
            
            // Método de pago
            medio_pago: venta.medio_pago || 'EFECTIVO',
            
            // Observaciones
            observaciones: venta.observaciones || null
        };

        return datosTicket;
    } catch (error) {
        console.error('❌ Error obteniendo datos de ticket para impresión:', error);
        throw error;
    }
};

module.exports = {
    obtenerDatosComanda,
    obtenerDatosTicket,
    buscarVentaAsociada
};




