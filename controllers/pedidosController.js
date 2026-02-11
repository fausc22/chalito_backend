const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');
const KitchenCapacityService = require('../services/KitchenCapacityService');
const PrintService = require('../services/PrintService');

/**
 * Crear un nuevo pedido
 * POST /pedidos
 */
const crearPedido = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { articulos, ...pedidoData } = req.validatedData || req.body;
            const usuario = req.user || {};
            
            // Determinar prioridad (ALTA si no tiene horario_entrega, NORMAL si es programado)
            const prioridad = pedidoData.horario_entrega ? 'NORMAL' : 'ALTA';
            
            // Si es pedido programado, calcular hora_inicio_preparacion
            let horaInicioPreparacion = null;
            if (pedidoData.horario_entrega) {
                const tiempoEstimado = pedidoData.tiempo_estimado_preparacion || 15;
                const horarioEntregaDate = new Date(pedidoData.horario_entrega);
                horaInicioPreparacion = new Date(horarioEntregaDate.getTime() - tiempoEstimado * 60 * 1000);
            }
            
            // Insertar pedido
            const pedidoQuery = `
                INSERT INTO pedidos (
                    fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
                    estado, observaciones, usuario_id, usuario_nombre,
                    prioridad, tiempo_estimado_preparacion, hora_inicio_preparacion, transicion_automatica
                ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const pedidoValues = [
                pedidoData.cliente_nombre,
                pedidoData.cliente_direccion,
                pedidoData.cliente_telefono,
                pedidoData.cliente_email,
                pedidoData.origen_pedido || 'MOSTRADOR',
                pedidoData.subtotal,
                pedidoData.iva_total,
                pedidoData.total,
                pedidoData.medio_pago,
                pedidoData.estado_pago || 'DEBE',
                pedidoData.modalidad,
                pedidoData.horario_entrega ? new Date(pedidoData.horario_entrega) : null,
                pedidoData.estado || 'RECIBIDO',
                pedidoData.observaciones,
                usuario.id || null,
                usuario.nombre || usuario.usuario || null,
                prioridad,
                pedidoData.tiempo_estimado_preparacion || 15,
                horaInicioPreparacion,
                pedidoData.transicion_automatica !== undefined ? pedidoData.transicion_automatica : true
            ];
            
            const [pedidoResult] = await connection.execute(pedidoQuery, pedidoValues);
            const pedidoId = pedidoResult.insertId;
            
            // Insertar artículos del pedido
            const articuloQuery = `
                INSERT INTO pedidos_contenido (
                    pedido_id, articulo_id, articulo_nombre, cantidad, precio, subtotal,
                    personalizaciones, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            for (const articulo of articulos) {
                await connection.execute(articuloQuery, [
                    pedidoId,
                    articulo.articulo_id,
                    articulo.articulo_nombre,
                    articulo.cantidad,
                    articulo.precio,
                    articulo.subtotal,
                    articulo.personalizaciones ? JSON.stringify(articulo.personalizaciones) : null,
                    articulo.observaciones
                ]);
                
                // Actualizar stock del artículo
                await connection.execute(
                    'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ?',
                    [articulo.cantidad, articulo.articulo_id]
                );
            }
            
            await connection.commit();
            
            // Obtener pedido creado para emitir evento WebSocket
            const [pedidoCreado] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'pedidos',
                registroId: pedidoId,
                datosNuevos: { pedidoId, ...pedidoData, articulos: articulos.length },
                detallesAdicionales: `Pedido creado - Cliente: ${pedidoData.cliente_nombre || 'N/A'} - Total: $${pedidoData.total}`
            });
            
            // Emitir evento WebSocket (Fase 3)
            const io = req.app.get('io');
            if (io && pedidoCreado.length > 0) {
                const { getInstance: getSocketService } = require('../services/SocketService');
                const socketService = getSocketService(io);
                if (socketService) {
                    socketService.emitPedidoCreado({ id: pedidoId, ...pedidoCreado[0] });
                }
            }
            
            // Si el pedido es "cuanto antes" (sin horario_entrega) y hay capacidad, evaluar cola inmediatamente
            // Esto proporciona respuesta instantánea sin esperar al próximo ciclo del worker (30s)
            if (!pedidoData.horario_entrega && (pedidoData.estado || 'RECIBIDO') === 'RECIBIDO') {
                try {
                    const OrderQueueEngine = require('../services/OrderQueueEngine').OrderQueueEngine;
                    const KitchenCapacityService = require('../services/KitchenCapacityService');
                    
                    // Verificar capacidad disponible
                    const hayCapacidad = await KitchenCapacityService.hayCapacidadDisponible();
                    if (hayCapacidad) {
                        // Ejecutar evaluación inmediata (en background para no retrasar la respuesta)
                        console.log(`⚡ [pedidosController] Pedido #${pedidoId} "cuanto antes" creado, evaluando cola inmediatamente...`);
                        OrderQueueEngine.evaluarColaPedidos().catch(err => {
                            console.error('❌ [pedidosController] Error al evaluar cola después de crear pedido:', err);
                        });
                    } else {
                        console.log(`⏳ [pedidosController] Pedido #${pedidoId} en cola (cocina al máximo), worker lo procesará cuando haya capacidad`);
                    }
                } catch (error) {
                    // No fallar si hay error, el worker lo procesará en el próximo ciclo
                    console.error('⚠️ [pedidosController] Error al evaluar cola inmediatamente (el worker lo procesará):', error);
                }
            }
            
            res.status(201).json({
                success: true,
                message: 'Pedido creado exitosamente',
                data: { id: pedidoId, ...pedidoData }
            });
            
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al crear pedido:', error);
            
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'pedidos',
                estado: 'FALLIDO',
                detallesAdicionales: `Error al crear pedido: ${error.message}`
            });
            
            res.status(500).json({
                success: false,
                message: 'Error al crear pedido',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            connection.release();
        }
};

/**
 * Obtener todos los pedidos
 * GET /pedidos
 */
const obtenerPedidos = async (req, res) => {
    try {
        const { estado, modalidad, fecha_desde, fecha_hasta } = req.query;
        
        let query = 'SELECT * FROM pedidos WHERE 1=1';
        const params = [];
        
        if (estado) {
            query += ' AND estado = ?';
            params.push(estado);
            
            // EN_PREPARACION: solo del día (flujo operativo diario)
            // LISTO: últimos 7 días (estado operativo, NO cierre; puede estar pendiente cobro/entregar)
            if (estado === 'EN_PREPARACION') {
                query += ' AND DATE(fecha) = CURDATE()';
            } else if (estado === 'LISTO') {
                query += ' AND DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
            }
        } else {
            // Regla: LISTO es solo estado operativo de cocina, NO cierre del pedido.
            // El pedido solo se considera finalizado cuando estado=ENTREGADO (y estado_pago=PAGADO).
            // - RECIBIDO, EN_PREPARACION: flujo del día actual
            // - LISTO: visible últimos 7 días (pendiente cobro o pendiente entregar)
            // - ENTREGADO, CANCELADO: finalizados, últimos 7 días
            query += ` AND (
                (estado IN ('RECIBIDO', 'EN_PREPARACION') AND DATE(fecha) = CURDATE())
                OR (estado = 'LISTO' AND DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))
                OR (estado IN ('ENTREGADO', 'CANCELADO') AND DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))
            )`;
        }
        
        if (modalidad) {
            query += ' AND modalidad = ?';
            params.push(modalidad);
        }
        
        if (fecha_desde) {
            query += ' AND DATE(fecha) >= DATE(?)';
            params.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            query += ' AND DATE(fecha) <= DATE(?)';
            params.push(fecha_hasta);
        }
        
        query += ' ORDER BY fecha DESC';
        
        const [pedidos] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: pedidos
        });
    } catch (error) {
        console.error('❌ Error al obtener pedidos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener pedidos'
        });
    }
};

/**
 * Obtener un pedido por ID
 * GET /pedidos/:id
 */
const obtenerPedidoPorId = async (req, res) => {
        try {
            const { id } = req.validatedParams || req.params;
            
            const [pedidos] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
            
            if (pedidos.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            const [articulos] = await db.execute(
                'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
                [id]
            );

            const pedidoCompleto = { ...pedidos[0], articulos };
            res.json({
                success: true,
                data: pedidoCompleto
            });
        } catch (error) {
            console.error('❌ Error al obtener pedido:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener pedido'
            });
        }
};

/**
 * Actualizar estado de pedido
 * PUT /pedidos/:id/estado
 */
const actualizarEstadoPedido = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            const { id } = req.validatedParams || req.params;
            const { estado } = req.validatedData || req.body;
            
            // Obtener datos anteriores
            const datosAnteriores = await obtenerDatosAnteriores('pedidos', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            await connection.beginTransaction();
            
            // Log para debugging
            console.log(`🔄 [BACKEND] Actualizando pedido ${id} de estado "${datosAnteriores.estado}" a "${estado}"`);
            
            // ✅ Validar que ENTREGAR requiere que el pedido esté COBRADO
            if (estado === 'ENTREGADO' && datosAnteriores.estado !== 'ENTREGADO') {
                const [pedidoInfo] = await connection.execute(
                    'SELECT estado_pago FROM pedidos WHERE id = ?',
                    [id]
                );
                
                if (pedidoInfo.length === 0) {
                    await connection.rollback();
                    return res.status(404).json({
                        success: false,
                        message: 'Pedido no encontrado'
                    });
                }
                
                if (pedidoInfo[0].estado_pago !== 'PAGADO') {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede entregar un pedido que no está cobrado. El pedido debe estar en estado PAGADO para poder entregarse.',
                        code: 'PEDIDO_NO_COBRADO',
                        estado_pago_actual: pedidoInfo[0].estado_pago
                    });
                }
                
                // ✅ Validar integridad: verificar que existe una venta asociada
                const { buscarVentaAsociada } = require('../services/PrintService');
                const venta = await buscarVentaAsociada(id);
                if (!venta) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede entregar un pedido sin venta asociada. El pedido debe estar cobrado primero.',
                        code: 'SIN_VENTA_ASOCIADA'
                    });
                }
                
                console.log(`✅ [BACKEND] Validación OK: Pedido #${id} está cobrado y tiene venta asociada #${venta.id}`);
            }
            
            // ✅ Validar capacidad si se intenta mover a EN_PREPARACION manualmente
            if (estado === 'EN_PREPARACION' && datosAnteriores.estado !== 'EN_PREPARACION') {
                // Verificar si el pedido tiene transicion_automatica = false (permitir bypass)
                const [pedidoData] = await connection.execute(
                    'SELECT transicion_automatica FROM pedidos WHERE id = ?',
                    [id]
                );
                
                const transicionAutomatica = pedidoData.length > 0 ? pedidoData[0].transicion_automatica : true;
                
                // Si transicion_automatica = true, validar capacidad (el motor debería hacerlo automáticamente)
                // Si transicion_automatica = false, permitir bypass manual (excepción)
                if (transicionAutomatica) {
                    const hayCapacidad = await KitchenCapacityService.hayCapacidadDisponible();
                    
                    if (!hayCapacidad) {
                        await connection.rollback();
                        const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
                        return res.status(400).json({
                            success: false,
                            message: `No hay capacidad disponible. Cocina al máximo (${infoCapacidad.pedidosEnPreparacion}/${infoCapacidad.capacidadMaxima} pedidos en preparación)`
                        });
                    }
                } else {
                    console.log(`⚠️ [BACKEND] Bypass manual permitido para pedido #${id} (transicion_automatica = false)`);
                }
            }
            
            // Actualizar estado
            let updateQuery = 'UPDATE pedidos SET estado = ?';
            const updateParams = [estado];
            
            // ✅ Si el estado cambia a LISTO, registrar hora_listo
            if (estado === 'LISTO' && datosAnteriores.estado !== 'LISTO') {
                updateQuery += ', hora_listo = ?';
                updateParams.push(new Date());
                console.log(`📝 [BACKEND] Registrando hora_listo para pedido #${id}`);
            }
            
            updateQuery += ' WHERE id = ?';
            updateParams.push(id);
            
            const [result] = await connection.execute(updateQuery, updateParams);
            
            // Verificar que se actualizó correctamente
            const [verificacion] = await connection.execute(
                'SELECT estado FROM pedidos WHERE id = ?',
                [id]
            );
            console.log(`✅ [BACKEND] Estado actualizado. Estado actual en BD: "${verificacion[0]?.estado}"`);
            
            // ✅ Si el estado cambia a EN_PREPARACION, registrar hora_inicio_preparacion y crear comanda
            if (estado === 'EN_PREPARACION' && datosAnteriores.estado !== 'EN_PREPARACION') {
                // Registrar hora_inicio_preparacion si no está ya registrada
                const ahora = new Date();
                await connection.execute(
                    'UPDATE pedidos SET hora_inicio_preparacion = ? WHERE id = ? AND hora_inicio_preparacion IS NULL',
                    [ahora, id]
                );
                
                // Calcular y actualizar hora_esperada_finalizacion
                const [pedidoInfo] = await connection.execute(
                    'SELECT tiempo_estimado_preparacion FROM pedidos WHERE id = ?',
                    [id]
                );
                
                if (pedidoInfo.length > 0) {
                    const tiempoEstimado = pedidoInfo[0].tiempo_estimado_preparacion || 15;
                    const horaEsperadaFinalizacion = new Date(ahora.getTime() + tiempoEstimado * 60 * 1000);
                    
                    await connection.execute(
                        'UPDATE pedidos SET hora_esperada_finalizacion = ? WHERE id = ?',
                        [horaEsperadaFinalizacion, id]
                    );
                }
            }
            
            // ✅ Si el estado cambia a EN_PREPARACION, crear comanda automáticamente
            if (estado === 'EN_PREPARACION' && datosAnteriores.estado !== 'EN_PREPARACION') {
                // Verificar si ya existe una comanda para este pedido
                const [comandasExistentes] = await connection.execute(
                    'SELECT id FROM comandas WHERE pedido_id = ?',
                    [id]
                );
                
                if (comandasExistentes.length === 0) {
                    // Obtener datos del pedido
                    const [pedidoData] = await connection.execute(
                        'SELECT * FROM pedidos WHERE id = ?',
                        [id]
                    );
                    
                    if (pedidoData.length > 0) {
                        const pedido = pedidoData[0];
                        
                        // Obtener artículos del pedido
                        const [articulosPedido] = await connection.execute(
                            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
                            [id]
                        );
                        
                        // Crear comanda
                        // NOTA: La comanda no maneja estado propio, depende del pedido (pedidos.estado)
                        const comandaQuery = `
                            INSERT INTO comandas (
                                pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                                modalidad, horario_entrega, observaciones, usuario_id, usuario_nombre
                            ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;
                        
                        const comandaValues = [
                            pedido.id,
                            pedido.cliente_nombre,
                            pedido.cliente_direccion,
                            pedido.cliente_telefono,
                            pedido.cliente_email,
                            pedido.modalidad,
                            pedido.horario_entrega,
                            pedido.observaciones,
                            req.user?.id || null,
                            req.user?.nombre || req.user?.usuario || null
                        ];
                        
                        const [comandaResult] = await connection.execute(comandaQuery, comandaValues);
                        const comandaId = comandaResult.insertId;
                        
                        // Insertar artículos en comandas_contenido
                        const articuloComandaQuery = `
                            INSERT INTO comandas_contenido (
                                comanda_id, articulo_id, articulo_nombre, cantidad, personalizaciones, observaciones
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `;
                        
                        for (const articulo of articulosPedido) {
                            // Parsear personalizaciones si existen en pedidos_contenido
                            let personalizaciones = null;
                            if (articulo.personalizaciones) {
                                try {
                                    personalizaciones = typeof articulo.personalizaciones === 'string'
                                        ? articulo.personalizaciones
                                        : JSON.stringify(articulo.personalizaciones);
                                } catch (e) {
                                    console.warn('Error parseando personalizaciones:', e);
                                    personalizaciones = null;
                                }
                            }
                            
                            await connection.execute(articuloComandaQuery, [
                                comandaId,
                                articulo.articulo_id,
                                articulo.articulo_nombre,
                                articulo.cantidad,
                                personalizaciones,
                                articulo.observaciones
                            ]);
                        }
                        
                        console.log(`✅ Comanda #${comandaId} creada automáticamente para pedido #${id}`);
                    }
                } else {
                    console.log(`ℹ️ Ya existe una comanda para el pedido #${id}`);
                }
            }
            
            // Si se cancela, restaurar stock
            if (estado === 'CANCELADO' && datosAnteriores.estado !== 'CANCELADO') {
                const [articulos] = await connection.execute(
                    'SELECT articulo_id, cantidad FROM pedidos_contenido WHERE pedido_id = ?',
                    [id]
                );
                
                for (const articulo of articulos) {
                    await connection.execute(
                        'UPDATE articulos SET stock_actual = stock_actual + ? WHERE id = ?',
                        [articulo.cantidad, articulo.articulo_id]
                    );
                }
            }
            
            await connection.commit();
            
            // Obtener pedido completo actualizado (con articulos) para respuesta
            const [pedRows] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
            const [articulosRows] = await connection.execute('SELECT * FROM pedidos_contenido WHERE pedido_id = ?', [id]);
            const pedidoActualizado = { ...pedRows[0], articulos: articulosRows };

            // Auditoría
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'pedidos',
                registroId: id,
                datosAnteriores,
                datosNuevos: { ...datosAnteriores, estado },
                detallesAdicionales: `Estado cambiado de "${datosAnteriores.estado}" a "${estado}"`
            });
            
            // Emitir evento WebSocket (Fase 3)
            const io = req.app.get('io');
            if (io) {
                const { getInstance: getSocketService } = require('../services/SocketService');
                const socketService = getSocketService(io);
                if (socketService && pedidoActualizado) {
                    socketService.emitPedidoEstadoCambiado(id, datosAnteriores.estado, estado, pedidoActualizado);
                    if (estado === 'ENTREGADO' && datosAnteriores.estado !== 'ENTREGADO') {
                        socketService.emitPedidoEntregado(id, pedidoActualizado);
                    }
                    
                    // Si cambió la capacidad (entró o salió de EN_PREPARACION), emitir evento de capacidad
                    if ((datosAnteriores.estado === 'EN_PREPARACION' || estado === 'EN_PREPARACION')) {
                        const KitchenCapacityService = require('../services/KitchenCapacityService');
                        const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
                        socketService.emitCapacidadActualizada(infoCapacidad);
                    }
                }
            }
            
            res.json({
                success: true,
                message: 'Estado actualizado correctamente',
                data: {
                    pedido: pedidoActualizado,
                    estado: estado,
                    listo: estado === 'LISTO',
                    entregado: estado === 'ENTREGADO'
                }
            });
            
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al actualizar estado:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar estado'
            });
        } finally {
            connection.release();
        }
};

/**
 * Actualizar observaciones de pedido
 * PUT /pedidos/:id/observaciones
 */
const actualizarObservaciones = async (req, res) => {
        try {
            const { id } = req.validatedParams || req.params;
            const { observaciones } = req.validatedData || req.body;
            
            const datosAnteriores = await obtenerDatosAnteriores('pedidos', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            await db.execute(
                'UPDATE pedidos SET observaciones = ? WHERE id = ?',
                [observaciones, id]
            );
            
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'pedidos',
                registroId: id,
                datosAnteriores,
                datosNuevos: { ...datosAnteriores, observaciones }
            });
            
            res.json({
                success: true,
                message: 'Observaciones actualizadas correctamente'
            });
        } catch (error) {
            console.error('❌ Error al actualizar observaciones:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar observaciones'
            });
        }
};

/**
 * Actualizar pedido (edición completa)
 * PUT /pedidos/:id
 *
 * Regla obligatoria: siempre actualiza pedidos Y pedidos_contenido dentro de una transacción.
 * Permite edición en vivo cuando está RECIBIDO, EN_PREPARACION o LISTO.
 * NO permite editar pedidos ENTREGADOS o CANCELADOS.
 *
 * @payload Esperado desde frontend (todos los campos que se deseen actualizar):
 *   - articulos: array (OBLIGATORIO, min 1) - reemplaza pedidos_contenido
 *   - cliente_nombre, cliente_direccion, cliente_telefono, cliente_email: string
 *   - origen_pedido: 'MOSTRADOR'|'TELEFONO'|'WHATSAPP'|'WEB'
 *   - modalidad: 'DELIVERY'|'RETIRO'
 *   - horario_entrega: ISO datetime o null (pedido programado vs cuanto antes)
 *   - estado_pago: 'DEBE'|'PAGADO', medio_pago: string, observaciones: string
 *   - subtotal, iva_total, total: number (opcionales, se calculan desde articulos si faltan)
 *
 * @response { success: true, message, data: { ...pedido, articulos: [...] } }
 * @realtime Emite pedido:actualizado con pedido completo (pedido + articulos)
 */
const actualizarPedido = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.validatedParams || req.params;
        const data = req.validatedData || req.body;
        const { articulos, ...camposPedido } = data;
        const usuario = req.user || {};

        await connection.beginTransaction();

        // 1. Obtener datos anteriores
        const [pedidosAnteriores] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
        if (pedidosAnteriores.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Pedido no encontrado'
            });
        }
        const datosAnteriores = pedidosAnteriores[0];

        // 2. Validar que NO esté ENTREGADO o CANCELADO
        if (datosAnteriores.estado === 'ENTREGADO' || datosAnteriores.estado === 'CANCELADO') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `No se puede editar un pedido que está ${datosAnteriores.estado}. Solo se pueden editar pedidos en estados: RECIBIDO, EN_PREPARACION, LISTO`,
                code: 'PEDIDO_NO_EDITABLE',
                estado_actual: datosAnteriores.estado
            });
        }

        // 3. Construir valores para UPDATE pedidos (payload prevalece, sino mantener anterior)
        const d = datosAnteriores;
        const cliente_nombre = camposPedido.cliente_nombre !== undefined ? camposPedido.cliente_nombre : d.cliente_nombre;
        const cliente_direccion = camposPedido.cliente_direccion !== undefined ? camposPedido.cliente_direccion : d.cliente_direccion;
        const cliente_telefono = camposPedido.cliente_telefono !== undefined ? camposPedido.cliente_telefono : d.cliente_telefono;
        const cliente_email = camposPedido.cliente_email !== undefined ? camposPedido.cliente_email : d.cliente_email;
        const origen_pedido = camposPedido.origen_pedido !== undefined ? camposPedido.origen_pedido : (d.origen_pedido || 'MOSTRADOR');
        const modalidad = camposPedido.modalidad !== undefined ? camposPedido.modalidad : d.modalidad;

        let horario_entrega = null;
        if (camposPedido.horario_entrega !== undefined) {
            horario_entrega = camposPedido.horario_entrega ? new Date(camposPedido.horario_entrega) : null;
        } else if (d.horario_entrega) {
            horario_entrega = d.horario_entrega;
        }

        const estado_pago = camposPedido.estado_pago !== undefined ? camposPedido.estado_pago : (d.estado_pago || 'DEBE');
        const medio_pago = camposPedido.medio_pago !== undefined ? camposPedido.medio_pago : d.medio_pago;
        const observaciones = camposPedido.observaciones !== undefined ? camposPedido.observaciones : (d.observaciones || '');

        // Calcular totales desde articulos si no vienen en payload
        let subtotal = camposPedido.subtotal;
        let iva_total = camposPedido.iva_total;
        let total = camposPedido.total;
        if (subtotal === undefined || iva_total === undefined || total === undefined) {
            let s = 0;
            for (const art of articulos) {
                s += parseFloat(art.subtotal) || 0;
            }
            subtotal = camposPedido.subtotal ?? s;
            iva_total = camposPedido.iva_total ?? subtotal * 0.21;
            total = camposPedido.total ?? subtotal + iva_total;
        }

        // hora_inicio_preparacion: recalcular si es pedido programado
        let hora_inicio_preparacion = d.hora_inicio_preparacion;
        const tiempoEstimado = d.tiempo_estimado_preparacion || 15;
        if (horario_entrega) {
            const h = new Date(horario_entrega);
            hora_inicio_preparacion = new Date(h.getTime() - tiempoEstimado * 60 * 1000);
        } else {
            hora_inicio_preparacion = null;
        }

        // 4. UPDATE pedidos (siempre)
        await connection.execute(
            `UPDATE pedidos SET
                cliente_nombre = ?, cliente_direccion = ?, cliente_telefono = ?, cliente_email = ?,
                origen_pedido = ?, modalidad = ?, horario_entrega = ?,
                estado_pago = ?, medio_pago = ?, observaciones = ?,
                subtotal = ?, iva_total = ?, total = ?,
                hora_inicio_preparacion = ?, fecha_modificacion = NOW()
            WHERE id = ?`,
            [
                cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                origen_pedido, modalidad, horario_entrega,
                estado_pago, medio_pago, observaciones,
                subtotal, iva_total, total,
                hora_inicio_preparacion, id
            ]
        );

        // 5. Stock: calcular diferencias (anteriores +, nuevos -)
        const [articulosAnteriores] = await connection.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
            [id]
        );
        const stockCambios = new Map();
        for (const art of articulosAnteriores) {
            const diff = stockCambios.get(art.articulo_id) || 0;
            stockCambios.set(art.articulo_id, diff + art.cantidad);
        }

        // 6. DELETE pedidos_contenido
        await connection.execute('DELETE FROM pedidos_contenido WHERE pedido_id = ?', [id]);

        // 7. INSERT pedidos_contenido (siempre)
        const articuloQuery = `
            INSERT INTO pedidos_contenido (
                pedido_id, articulo_id, articulo_nombre, cantidad, precio, subtotal,
                personalizaciones, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const art of articulos) {
            await connection.execute(articuloQuery, [
                id,
                art.articulo_id,
                art.articulo_nombre,
                art.cantidad,
                art.precio,
                art.subtotal,
                art.personalizaciones ? JSON.stringify(art.personalizaciones) : null,
                art.observaciones || null
            ]);
            const diff = stockCambios.get(art.articulo_id) || 0;
            stockCambios.set(art.articulo_id, diff - art.cantidad);
        }

        // 8. Ajustar stock
        for (const [articuloId, diferencia] of stockCambios.entries()) {
            if (diferencia !== 0) {
                await connection.execute(
                    'UPDATE articulos SET stock_actual = stock_actual + ? WHERE id = ?',
                    [diferencia, articuloId]
                );
                console.log(`📦 [actualizarPedido] Stock ajustado artículo #${articuloId}: ${diferencia > 0 ? '+' : ''}${diferencia}`);
            }
        }

        // 9. Actualizar comanda si existe
        const [comandas] = await connection.execute('SELECT id FROM comandas WHERE pedido_id = ?', [id]);
        if (comandas.length > 0) {
            const comandaId = comandas[0].id;
            await connection.execute('DELETE FROM comandas_contenido WHERE comanda_id = ?', [comandaId]);
            const comandaItemQuery = `
                INSERT INTO comandas_contenido (comanda_id, articulo_id, articulo_nombre, cantidad, personalizaciones, observaciones)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            for (const art of articulos) {
                const pers = art.personalizaciones
                    ? (typeof art.personalizaciones === 'string' ? art.personalizaciones : JSON.stringify(art.personalizaciones))
                    : null;
                await connection.execute(comandaItemQuery, [
                    comandaId, art.articulo_id, art.articulo_nombre, art.cantidad, pers, art.observaciones || null
                ]);
            }
            console.log(`✅ Comanda #${comandaId} actualizada para pedido #${id}`);
        }

        await connection.commit();

        // 10. Obtener pedido completo actualizado
        const [pedidosActualizados] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
        const [articulosActualizados] = await connection.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
            [id]
        );
        const pedidoActualizado = {
            ...pedidosActualizados[0],
            articulos: articulosActualizados
        };

        // Auditoría
        await auditarOperacion(req, {
            accion: 'UPDATE_PEDIDO_COMPLETO',
            tabla: 'pedidos',
            registroId: id,
            datosAnteriores: datosAnteriores,
            datosNuevos: pedidosActualizados[0],
            detallesAdicionales: `Pedido editado - Usuario: ${usuario.nombre || usuario.usuario || 'N/A'} - Items: ${articulos.length}`
        });

        // 11. Emitir pedido:actualizado (realtime)
        const io = req.app.get('io');
        if (io) {
            const { getInstance: getSocketService } = require('../services/SocketService');
            const socketService = getSocketService(io);
            if (socketService) {
                socketService.emitPedidoActualizado(id, pedidoActualizado);
            }
        }

        res.json({
            success: true,
            message: 'Pedido actualizado correctamente',
            data: pedidoActualizado
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al actualizar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar pedido',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Eliminar pedido
 * DELETE /pedidos/:id
 */
const eliminarPedido = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            const { id } = req.validatedParams || req.params;
            
            const datosAnteriores = await obtenerDatosAnteriores('pedidos', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            await connection.beginTransaction();
            
            // Obtener artículos antes de eliminar
            const [articulos] = await connection.execute(
                'SELECT articulo_id, cantidad FROM pedidos_contenido WHERE pedido_id = ?',
                [id]
            );
            
            // Restaurar stock
            for (const articulo of articulos) {
                await connection.execute(
                    'UPDATE articulos SET stock_actual = stock_actual + ? WHERE id = ?',
                    [articulo.cantidad, articulo.articulo_id]
                );
            }
            
            // Eliminar pedido (cascade eliminará pedidos_contenido)
            await connection.execute('DELETE FROM pedidos WHERE id = ?', [id]);
            
            await connection.commit();
            
            await auditarOperacion(req, {
                accion: 'DELETE',
                tabla: 'pedidos',
                registroId: id,
                datosAnteriores
            });
            
            res.json({
                success: true,
                message: 'Pedido eliminado correctamente'
            });
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al eliminar pedido:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar pedido'
            });
        } finally {
            connection.release();
        }
};

/**
 * Agregar artículo a pedido existente
 * POST /pedidos/:id/articulos
 */
const agregarArticulo = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            const { id } = req.validatedParams || req.params;
            const articulo = req.validatedData || req.body;
            
            // Verificar que el pedido existe
            const [pedidos] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
            
            if (pedidos.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            await connection.beginTransaction();
            
            // Insertar artículo
            await connection.execute(
                `INSERT INTO pedidos_contenido (
                    pedido_id, articulo_id, articulo_nombre, cantidad, precio, subtotal,
                    personalizaciones, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    articulo.articulo_id,
                    articulo.articulo_nombre,
                    articulo.cantidad,
                    articulo.precio,
                    articulo.subtotal,
                    articulo.personalizaciones ? JSON.stringify(articulo.personalizaciones) : null,
                    articulo.observaciones
                ]
            );
            
            // Actualizar stock
            await connection.execute(
                'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ?',
                [articulo.cantidad, articulo.articulo_id]
            );
            
            // Recalcular totales
            const [totales] = await connection.execute(
                `SELECT 
                    SUM(subtotal) as subtotal_total,
                    SUM(subtotal * 0.21) as iva_total
                FROM pedidos_contenido WHERE pedido_id = ?`,
                [id]
            );
            
            const subtotalTotal = parseFloat(totales[0].subtotal_total) || 0;
            const ivaTotal = parseFloat(totales[0].iva_total) || 0;
            const total = subtotalTotal + ivaTotal;
            
            await connection.execute(
                'UPDATE pedidos SET subtotal = ?, iva_total = ?, total = ? WHERE id = ?',
                [subtotalTotal, ivaTotal, total, id]
            );
            
            await connection.commit();
            
            res.json({
                success: true,
                message: 'Artículo agregado correctamente'
            });
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al agregar artículo:', error);
            res.status(500).json({
                success: false,
                message: 'Error al agregar artículo'
            });
        } finally {
            connection.release();
        }
};

/**
 * Obtener información de capacidad de cocina
 * GET /pedidos/capacidad
 */
const obtenerCapacidadCocina = async (req, res) => {
    try {
        const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
        
        res.json({
            success: true,
            data: infoCapacidad
        });
    } catch (error) {
        console.error('❌ Error al obtener capacidad:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener capacidad de cocina'
        });
    }
};

/**
 * Forzar cambio de estado (bypass manual) - Solo ADMIN/GERENTE
 * POST /pedidos/:id/forzar-estado
 */
const forzarEstadoPedido = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const { id } = req.validatedParams || req.params;
        const { estado } = req.validatedData || req.body;
        
        // Verificar permisos (solo ADMIN/GERENTE)
        const usuario = req.user || {};
        if (usuario.rol !== 'ADMIN' && usuario.rol !== 'GERENTE') {
            return res.status(403).json({
                success: false,
                message: 'No tiene permisos para forzar cambios de estado. Solo ADMIN y GERENTE pueden hacerlo.'
            });
        }
        
        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('pedidos', id);
        
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Pedido no encontrado'
            });
        }
        
        await connection.beginTransaction();
        
        // Actualizar estado sin validar capacidad (bypass)
        await connection.execute(
            'UPDATE pedidos SET estado = ? WHERE id = ?',
            [estado, id]
        );
        
        // Si pasa a EN_PREPARACION, registrar timestamps
        if (estado === 'EN_PREPARACION' && datosAnteriores.estado !== 'EN_PREPARACION') {
            const ahora = new Date();
            await connection.execute(
                'UPDATE pedidos SET hora_inicio_preparacion = ? WHERE id = ? AND hora_inicio_preparacion IS NULL',
                [ahora, id]
            );
            
            const [pedidoInfo] = await connection.execute(
                'SELECT tiempo_estimado_preparacion FROM pedidos WHERE id = ?',
                [id]
            );
            
            if (pedidoInfo.length > 0) {
                const tiempoEstimado = pedidoInfo[0].tiempo_estimado_preparacion || 15;
                const horaEsperadaFinalizacion = new Date(ahora.getTime() + tiempoEstimado * 60 * 1000);
                
                await connection.execute(
                    'UPDATE pedidos SET hora_esperada_finalizacion = ? WHERE id = ?',
                    [horaEsperadaFinalizacion, id]
                );
            }
            
            // Crear comanda si no existe
            const [comandasExistentes] = await connection.execute(
                'SELECT id FROM comandas WHERE pedido_id = ?',
                [id]
            );
            
            if (comandasExistentes.length === 0) {
                // Reutilizar lógica de creación de comanda (similar a actualizarEstadoPedido)
                const [pedidoData] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
                if (pedidoData.length > 0) {
                    const pedido = pedidoData[0];
                    const [articulosPedido] = await connection.execute(
                        'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
                        [id]
                    );
                    
                    // NOTA: La comanda no maneja estado propio, depende del pedido (pedidos.estado)
                    const [comandaResult] = await connection.execute(
                        `INSERT INTO comandas (
                            pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                            modalidad, horario_entrega, observaciones, usuario_id, usuario_nombre
                        ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            pedido.id, pedido.cliente_nombre, pedido.cliente_direccion,
                            pedido.cliente_telefono, pedido.cliente_email, pedido.modalidad,
                            pedido.horario_entrega, pedido.observaciones,
                            usuario.id || null, usuario.nombre || usuario.usuario || null
                        ]
                    );
                    
                    const comandaId = comandaResult.insertId;
                    for (const articulo of articulosPedido) {
                        let personalizaciones = null;
                        if (articulo.personalizaciones) {
                            try {
                                personalizaciones = typeof articulo.personalizaciones === 'string'
                                    ? articulo.personalizaciones
                                    : JSON.stringify(articulo.personalizaciones);
                            } catch (e) {
                                personalizaciones = null;
                            }
                        }
                        
                        await connection.execute(
                            `INSERT INTO comandas_contenido (
                                comanda_id, articulo_id, articulo_nombre, cantidad, personalizaciones, observaciones
                            ) VALUES (?, ?, ?, ?, ?, ?)`,
                            [comandaId, articulo.articulo_id, articulo.articulo_nombre, articulo.cantidad, personalizaciones, articulo.observaciones]
                        );
                    }
                }
            }
        }
        
        await connection.commit();
        
        // Auditoría especial para bypass
        await auditarOperacion(req, {
            accion: 'UPDATE',
            tabla: 'pedidos',
            registroId: id,
            datosAnteriores,
            datosNuevos: { ...datosAnteriores, estado },
            detallesAdicionales: `BYPASS MANUAL: Estado forzado de "${datosAnteriores.estado}" a "${estado}" por ${usuario.rol}`
        });
        
        res.json({
            success: true,
            message: 'Estado forzado correctamente (bypass manual)'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al forzar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al forzar estado'
        });
    } finally {
        connection.release();
    }
};

/**
 * Obtener datos para imprimir comanda
 * GET /pedidos/:id/comanda-print
 */
const imprimirComanda = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        const datosComanda = await PrintService.obtenerDatosComanda(id);
        
        res.json({
            success: true,
            data: datosComanda
        });
    } catch (error) {
        console.error('❌ Error al obtener datos de comanda para impresión:', error);
        
        if (error.message.includes('no encontrado')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al obtener datos de comanda para impresión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Cobrar pedido
 * POST /pedidos/:id/cobrar
 * 
 * Reglas:
 * - El pedido debe estar en estado LISTO
 * - Genera una venta asociada al pedido
 * - Marca el pedido como PAGADO
 * - Emite evento pedido:cobrado
 */
const cobrarPedido = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.validatedParams || req.params;
        const { medio_pago, cuenta_id, tipo_factura } = req.body || {};
        const usuario = req.user || {};

        await connection.beginTransaction();

        // Lock row para evitar race condition (doble cobro)
        const [pedidos] = await connection.execute(
            'SELECT * FROM pedidos WHERE id = ? FOR UPDATE',
            [id]
        );

        if (pedidos.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Pedido no encontrado'
            });
        }

        const pedido = pedidos[0];

        // Validar estado LISTO
        if (pedido.estado !== 'LISTO') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `No se puede cobrar un pedido que no está LISTO. Estado actual: ${pedido.estado}`,
                code: 'PEDIDO_NO_LISTO',
                estado_actual: pedido.estado
            });
        }

        // Idempotencia: si ya está cobrado, devolver éxito con venta existente (no duplicar)
        if (pedido.estado_pago === 'PAGADO') {
            await connection.rollback();
            const { buscarVentaAsociada } = require('../services/PrintService');
            const ventaExistente = await buscarVentaAsociada(id);
            const [ped] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
            const [arts] = await connection.execute('SELECT * FROM pedidos_contenido WHERE pedido_id = ?', [id]);
            const pedidoCompleto = { ...ped[0], articulos: arts };
            return res.json({
                success: true,
                message: 'Pedido ya estaba cobrado',
                data: {
                    pedido: pedidoCompleto,
                    venta_id: ventaExistente?.id,
                    pagado: true
                }
            });
        }
        
        // Obtener artículos del pedido
        const [articulosPedido] = await connection.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
            [id]
        );
        
        if (articulosPedido.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'El pedido no tiene artículos'
            });
        }
        
        // ✅ Crear venta basada en el pedido
        let ventaResult;
        try {
            const ventaQueryConPedido = `
                INSERT INTO ventas (
                    pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    subtotal, iva_total, descuento, total, medio_pago, cuenta_id,
                    estado, observaciones, tipo_factura, usuario_id, usuario_nombre
                ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FACTURADA', ?, ?, ?, ?)
            `;
            [ventaResult] = await connection.execute(ventaQueryConPedido, [
                id, pedido.cliente_nombre, pedido.cliente_direccion, pedido.cliente_telefono,
                pedido.cliente_email, pedido.subtotal, pedido.iva_total, 0, pedido.total,
                medio_pago || pedido.medio_pago || 'EFECTIVO', cuenta_id || null,
                pedido.observaciones, tipo_factura || null, usuario.id || null,
                usuario.nombre || usuario.usuario || null
            ]);
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR' && err.message && err.message.includes('pedido_id')) {
                const ventaQuerySinPedido = `
                    INSERT INTO ventas (
                        fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                        subtotal, iva_total, descuento, total, medio_pago, cuenta_id,
                        estado, observaciones, tipo_factura, usuario_id, usuario_nombre
                    ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FACTURADA', ?, ?, ?, ?)
                `;
                [ventaResult] = await connection.execute(ventaQuerySinPedido, [
                    pedido.cliente_nombre, pedido.cliente_direccion, pedido.cliente_telefono,
                    pedido.cliente_email, pedido.subtotal, pedido.iva_total, 0, pedido.total,
                    medio_pago || pedido.medio_pago || 'EFECTIVO', cuenta_id || null,
                    pedido.observaciones, tipo_factura || null, usuario.id || null,
                    usuario.nombre || usuario.usuario || null
                ]);
            } else {
                throw err;
            }
        }
        const ventaId = ventaResult.insertId;
        
        // Insertar artículos de la venta
        const articuloVentaQuery = `
            INSERT INTO ventas_contenido (
                venta_id, articulo_id, articulo_nombre, cantidad, precio, subtotal
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        for (const articulo of articulosPedido) {
            await connection.execute(articuloVentaQuery, [
                ventaId,
                articulo.articulo_id,
                articulo.articulo_nombre,
                articulo.cantidad,
                articulo.precio,
                articulo.subtotal
            ]);
        }
        
        // ✅ Actualizar estado_pago del pedido a PAGADO
        await connection.execute(
            'UPDATE pedidos SET estado_pago = ?, medio_pago = ? WHERE id = ?',
            ['PAGADO', medio_pago || pedido.medio_pago || 'EFECTIVO', id]
        );
        
        // Si hay cuenta_id, actualizar saldo
        if (cuenta_id) {
            const [saldoAnterior] = await connection.execute(
                'SELECT saldo FROM cuentas_fondos WHERE id = ?',
                [cuenta_id]
            );
            
            if (saldoAnterior.length > 0) {
                const saldoAnteriorValor = parseFloat(saldoAnterior[0].saldo) || 0;
                const saldoNuevoValor = saldoAnteriorValor + parseFloat(pedido.total);
                
                await connection.execute(
                    'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
                    [saldoNuevoValor, cuenta_id]
                );
                
                await connection.execute(
                    `INSERT INTO movimientos_fondos (
                        fecha, cuenta_id, tipo, origen, referencia_id, monto,
                        saldo_anterior, saldo_nuevo
                    ) VALUES (NOW(), ?, 'INGRESO', ?, ?, ?, ?, ?)`,
                    [
                        cuenta_id,
                        `Venta #${ventaId} (Pedido #${id})`,
                        ventaId,
                        pedido.total,
                        saldoAnteriorValor,
                        saldoNuevoValor
                    ]
                );
            }
        }
        
        await connection.commit();

        // Obtener pedido completo (con articulos) para respuesta consistente
        const [pedRows] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [id]);
        const [articulosRows] = await connection.execute(
            'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
            [id]
        );
        const pedidoActualizado = { ...pedRows[0], articulos: articulosRows };

        // Auditoría
        await auditarOperacion(req, {
            accion: 'COBRAR_PEDIDO',
            tabla: 'pedidos',
            registroId: id,
            datosAnteriores: pedido,
            datosNuevos: { ...pedido, estado_pago: 'PAGADO' },
            detallesAdicionales: `Pedido cobrado - Venta #${ventaId} creada - Total: $${pedido.total}`
        });
        
        // Emitir eventos WebSocket
        const io = req.app.get('io');
        if (io) {
            const { getInstance: getSocketService } = require('../services/SocketService');
            const socketService = getSocketService(io);
            if (socketService) {
                socketService.emitPedidoCobrado(id, ventaId, pedidoActualizado);
                socketService.emitPedidoActualizado(id, pedidoActualizado);
                socketService.emitVentaCreada(ventaId, { venta_id: ventaId, pedido_id: id, total: pedido.total });
            }
        }

        res.json({
            success: true,
            message: 'Pedido cobrado exitosamente',
            data: {
                pedido: pedidoActualizado,
                venta_id: ventaId,
                pagado: true
            }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al cobrar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cobrar pedido',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Obtener datos para imprimir ticket/factura
 * GET /pedidos/:id/ticket-print
 */
const imprimirTicket = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        const datosTicket = await PrintService.obtenerDatosTicket(id);
        
        res.json({
            success: true,
            data: datosTicket
        });
    } catch (error) {
        console.error('❌ Error al obtener datos de ticket para impresión:', error);
        
        // Errores específicos de validación de negocio
        if (error.message.includes('no está pagado')) {
            return res.status(400).json({
                success: false,
                message: error.message,
                code: 'PEDIDO_NO_PAGADO'
            });
        }
        
        if (error.message.includes('No existe una venta asociada')) {
            return res.status(404).json({
                success: false,
                message: error.message,
                code: 'VENTA_NO_ENCONTRADA'
            });
        }
        
        if (error.message.includes('no encontrado')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al obtener datos de ticket para impresión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    crearPedido,
    obtenerPedidos,
    obtenerPedidoPorId,
    actualizarPedido,
    actualizarEstadoPedido,
    actualizarObservaciones,
    eliminarPedido,
    agregarArticulo,
    obtenerCapacidadCocina,
    forzarEstadoPedido,
    cobrarPedido,
    imprimirComanda,
    imprimirTicket
};

