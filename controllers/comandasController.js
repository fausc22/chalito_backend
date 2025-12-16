const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');

/**
 * Crear una nueva comanda
 * POST /comandas
 */
const crearComanda = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { articulos, ...comandaData } = req.validatedData || req.body;
            const usuario = req.user || {};
            
            // Verificar que el pedido existe
            const [pedidos] = await connection.execute(
                'SELECT id FROM pedidos WHERE id = ?',
                [comandaData.pedido_id]
            );
            
            if (pedidos.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Pedido no encontrado'
                });
            }
            
            // Insertar comanda
            const comandaQuery = `
                INSERT INTO comandas (
                    pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    modalidad, horario_entrega, estado, observaciones, usuario_id, usuario_nombre
                ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const comandaValues = [
                comandaData.pedido_id,
                comandaData.cliente_nombre,
                comandaData.cliente_direccion,
                comandaData.cliente_telefono,
                comandaData.cliente_email,
                comandaData.modalidad,
                comandaData.horario_entrega ? new Date(comandaData.horario_entrega) : null,
                comandaData.estado,
                comandaData.observaciones,
                usuario.id || null,
                usuario.nombre || usuario.usuario || null
            ];
            
            const [comandaResult] = await connection.execute(comandaQuery, comandaValues);
            const comandaId = comandaResult.insertId;
            
            // Insertar artículos de la comanda
            const articuloQuery = `
                INSERT INTO comandas_contenido (
                    comanda_id, articulo_id, articulo_nombre, cantidad, personalizaciones, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            for (const articulo of articulos) {
                await connection.execute(articuloQuery, [
                    comandaId,
                    articulo.articulo_id,
                    articulo.articulo_nombre,
                    articulo.cantidad,
                    articulo.personalizaciones ? JSON.stringify(articulo.personalizaciones) : null,
                    articulo.observaciones
                ]);
            }
            
            await connection.commit();
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'comandas',
                registroId: comandaId,
                datosNuevos: { comandaId, ...comandaData, articulos: articulos.length },
                detallesAdicionales: `Comanda creada - Pedido #${comandaData.pedido_id} - Estado: ${comandaData.estado}`
            });
            
            res.status(201).json({
                success: true,
                message: 'Comanda creada exitosamente',
                data: { id: comandaId, ...comandaData }
            });
            
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al crear comanda:', error);
            
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'comandas',
                estado: 'FALLIDO',
                detallesAdicionales: `Error al crear comanda: ${error.message}`
            });
            
            res.status(500).json({
                success: false,
                message: 'Error al crear comanda',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            connection.release();
        }
};

/**
 * Obtener todas las comandas
 * GET /comandas
 */
const obtenerComandas = async (req, res) => {
    try {
        const { estado, modalidad, pedido_id, fecha_desde, fecha_hasta } = req.query;
        
        let query = 'SELECT * FROM comandas WHERE 1=1';
        const params = [];
        
        if (estado) {
            query += ' AND estado = ?';
            params.push(estado);
        }
        
        if (modalidad) {
            query += ' AND modalidad = ?';
            params.push(modalidad);
        }
        
        if (pedido_id) {
            query += ' AND pedido_id = ?';
            params.push(pedido_id);
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
        
        const [comandas] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: comandas
        });
    } catch (error) {
        console.error('❌ Error al obtener comandas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener comandas'
        });
    }
};

/**
 * Obtener una comanda por ID
 * GET /comandas/:id
 */
const obtenerComandaPorId = async (req, res) => {
        try {
            const { id } = req.validatedParams;
            
            const [comandas] = await db.execute('SELECT * FROM comandas WHERE id = ?', [id]);
            
            if (comandas.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Comanda no encontrada'
                });
            }
            
            const [articulos] = await db.execute(
                'SELECT * FROM comandas_contenido WHERE comanda_id = ?',
                [id]
            );
            
            res.json({
                success: true,
                data: {
                    comanda: comandas[0],
                    articulos
                }
            });
        } catch (error) {
            console.error('❌ Error al obtener comanda:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener comanda'
            });
        }
};

/**
 * Actualizar estado de comanda
 * PUT /comandas/:id/estado
 */
const actualizarEstadoComanda = async (req, res) => {
        try {
            const { id } = req.validatedParams || req.params;
            const { estado } = req.validatedData || req.body;
            
            // Obtener datos anteriores
            const datosAnteriores = await obtenerDatosAnteriores('comandas', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Comanda no encontrada'
                });
            }
            
            await db.execute(
                'UPDATE comandas SET estado = ? WHERE id = ?',
                [estado, id]
            );
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'comandas',
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
            console.error('❌ Error al actualizar estado:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar estado'
            });
        }
};

/**
 * Actualizar observaciones de comanda
 * PUT /comandas/:id/observaciones
 */
const actualizarObservaciones = async (req, res) => {
        try {
            const { id } = req.validatedParams || req.params;
            const { observaciones } = req.validatedData || req.body;
            
            const datosAnteriores = await obtenerDatosAnteriores('comandas', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Comanda no encontrada'
                });
            }
            
            await db.execute(
                'UPDATE comandas SET observaciones = ? WHERE id = ?',
                [observaciones, id]
            );
            
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'comandas',
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

module.exports = {
    crearComanda,
    obtenerComandas,
    obtenerComandaPorId,
    actualizarEstadoComanda,
    actualizarObservaciones
};

