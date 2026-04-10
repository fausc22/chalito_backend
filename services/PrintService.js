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
const { calcularTotalesDesdePrecioFinal } = require('./totalesPrecioFinal');

const formatHora = (value) => {
    const fecha = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(fecha.getTime())) return '--:--';
    return fecha.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

const parsePersonalizaciones = (personalizaciones) => {
    if (!personalizaciones) return null;
    if (typeof personalizaciones === 'string') {
        try {
            return JSON.parse(personalizaciones);
        } catch (_) {
            return null;
        }
    }
    return typeof personalizaciones === 'object' ? personalizaciones : null;
};

const mapExtras = (articulo = {}) => {
    const personalizaciones = parsePersonalizaciones(articulo.personalizaciones);
    if (!Array.isArray(personalizaciones?.extras)) return [];

    return personalizaciones.extras.map((extra = {}) => ({
        nombre: extra.nombre || extra.nombre_adicional || null,
        precio: parseFloat(extra.precio_extra ?? 0) || 0
    }));
};

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

        // Obtener artículos del pedido
        const [articulos] = await db.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ? ORDER BY id',
            [pedidoId]
        );

        if (articulos.length === 0) {
            throw new Error(`El pedido ${pedidoId} no tiene artículos`);
        }

        const pedidoCompleto = {
            ...pedido,
            articulos
        };

        // Calcular tiempo usando campos reales del pedido
        let tiempoTexto = 'CUANTO ANTES';
        if (pedidoCompleto.horario_entrega) {
            tiempoTexto = `Para ${formatHora(pedidoCompleto.horario_entrega)}`;
        } else if (pedidoCompleto.hora_esperada_finalizacion) {
            tiempoTexto = `Para ${formatHora(pedidoCompleto.hora_esperada_finalizacion)}`;
        }

        // Formatear items completos desde pedido.articulos
        const items = pedidoCompleto.articulos.map(articulo => {
            const extras = mapExtras(articulo);
            return {
                articulo_id: articulo.articulo_id,
                nombre: articulo.articulo_nombre || articulo.nombre,
                cantidad: articulo.cantidad,
                extras: extras.length > 0 ? extras : null,
                observaciones: articulo.observaciones || null
            };
        });

        const totalPedido = parseFloat(pedidoCompleto.total);
        const subtotalPedido = parseFloat(pedidoCompleto.subtotal);
        const totalNormalizado = Number.isFinite(totalPedido)
            ? totalPedido
            : (Number.isFinite(subtotalPedido) ? subtotalPedido : 0);

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
                id: pedidoCompleto.id,
                numero: pedidoCompleto.id,
                fecha: pedidoCompleto.fecha,
                hora: new Date(pedidoCompleto.fecha).toLocaleTimeString('es-AR', {
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                horario_entrega: pedidoCompleto.horario_entrega || null,
                hora_entrega: pedidoCompleto.hora_entrega || null,
                hora_programada: pedidoCompleto.hora_programada || null,
                hora_esperada_finalizacion: pedidoCompleto.hora_esperada_finalizacion || null,
                subtotal: Number.isFinite(subtotalPedido) ? subtotalPedido : 0,
                total: totalNormalizado,
                total_final: totalNormalizado
            },
            
            // Datos del cliente
            cliente: {
                nombre: pedidoCompleto.cliente_nombre || 'MOSTRADOR',
                direccion: pedidoCompleto.cliente_direccion || null,
                telefono: pedidoCompleto.cliente_telefono || null,
                email: pedidoCompleto.cliente_email || null
            },
            
            // Tipo y tiempo
            tipo: pedidoCompleto.modalidad, // DELIVERY o RETIRO
            tiempo: tiempoTexto,
            total: totalNormalizado,
            
            // Items
            items: items,
            
            // Estado de pago
            estado_pago: pedidoCompleto.estado_pago || 'DEBE',
            
            // Estado del pedido (la comanda no tiene estado propio)
            estado_pedido: pedidoCompleto.estado,
            
            // Observaciones
            observaciones: pedidoCompleto.observaciones || null
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

        const totalVentaBase = parseFloat(venta.total);
        const subtotalVentaBase = parseFloat(venta.subtotal);
        const totalFinalVenta = Number.isFinite(totalVentaBase)
            ? totalVentaBase
            : (Number.isFinite(subtotalVentaBase) ? subtotalVentaBase : 0);
        const totalesVenta = calcularTotalesDesdePrecioFinal(totalFinalVenta);

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
            subtotal: totalesVenta.subtotal,
            iva_total: totalesVenta.iva_total,
            descuento: parseFloat(venta.descuento || 0),
            total: totalesVenta.total,
            
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




