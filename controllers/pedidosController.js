const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');

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
            
            // Insertar pedido
            const pedidoQuery = `
                INSERT INTO pedidos (
                    fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
                    estado, observaciones, usuario_id, usuario_nombre
                ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                pedidoData.estado,
                pedidoData.observaciones,
                usuario.id || null,
                usuario.nombre || usuario.usuario || null
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
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'pedidos',
                registroId: pedidoId,
                datosNuevos: { pedidoId, ...pedidoData, articulos: articulos.length },
                detallesAdicionales: `Pedido creado - Cliente: ${pedidoData.cliente_nombre || 'N/A'} - Total: $${pedidoData.total}`
            });
            
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
            
            res.json({
                success: true,
                data: {
                    pedido: pedidos[0],
                    articulos
                }
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
            
            // Actualizar estado
            const [result] = await connection.execute(
                'UPDATE pedidos SET estado = ? WHERE id = ?',
                [estado, id]
            );
            
            // Verificar que se actualizó correctamente
            const [verificacion] = await connection.execute(
                'SELECT estado FROM pedidos WHERE id = ?',
                [id]
            );
            console.log(`✅ [BACKEND] Estado actualizado. Estado actual en BD: "${verificacion[0]?.estado}"`);
            
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
                        const comandaQuery = `
                            INSERT INTO comandas (
                                pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                                modalidad, horario_entrega, estado, observaciones, usuario_id, usuario_nombre
                            ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;
                        
                        const comandaValues = [
                            pedido.id,
                            pedido.cliente_nombre,
                            pedido.cliente_direccion,
                            pedido.cliente_telefono,
                            pedido.cliente_email,
                            pedido.modalidad,
                            pedido.horario_entrega,
                            'EN_PREPARACION',
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
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'pedidos',
                registroId: id,
                datosAnteriores,
                datosNuevos: { ...datosAnteriores, estado },
                detallesAdicionales: `Estado cambiado de "${datosAnteriores.estado}" a "${estado}"`
            });
            
            res.json({
                success: true,
                message: 'Estado actualizado correctamente'
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
 * Actualizar pedido (estado_pago, medio_pago, etc.)
 * PUT /pedidos/:id
 */
const actualizarPedido = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            const { id } = req.validatedParams || req.params;
            const { estado_pago, medio_pago } = req.body;
            
            // Obtener datos anteriores
            const datosAnteriores = await obtenerDatosAnteriores('pedidos', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            await connection.beginTransaction();
            
            // Construir query de actualización dinámicamente
            const updates = [];
            const values = [];
            
            if (estado_pago !== undefined) {
                updates.push('estado_pago = ?');
                values.push(estado_pago);
            }
            
            if (medio_pago !== undefined) {
                updates.push('medio_pago = ?');
                values.push(medio_pago);
            }
            
            if (updates.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'No se proporcionaron campos para actualizar'
                });
            }
            
            values.push(id);
            
            // Actualizar pedido
            await connection.execute(
                `UPDATE pedidos SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
            
            await connection.commit();
            
            // Obtener datos nuevos
            const [pedidosActualizados] = await connection.execute(
                'SELECT * FROM pedidos WHERE id = ?',
                [id]
            );
            const datosNuevos = pedidosActualizados[0];
            
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'pedidos',
                registroId: id,
                datosAnteriores,
                datosNuevos
            });
            
            res.json({
                success: true,
                message: 'Pedido actualizado correctamente',
                data: datosNuevos
            });
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al actualizar pedido:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar pedido'
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

module.exports = {
    crearPedido,
    obtenerPedidos,
    obtenerPedidoPorId,
    actualizarPedido,
    actualizarEstadoPedido,
    actualizarObservaciones,
    eliminarPedido,
    agregarArticulo
};

