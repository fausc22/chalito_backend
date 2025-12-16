const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores } = require('../middlewares/auditoriaMiddleware');

/**
 * Crear una nueva venta
 * POST /ventas
 */
const crearVenta = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { articulos, ...ventaData } = req.validatedData || req.body;
            const usuario = req.user || {};
            
            // Insertar venta
            const ventaQuery = `
                INSERT INTO ventas (
                    fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    subtotal, iva_total, descuento, total, medio_pago, cuenta_id,
                    estado, observaciones, tipo_factura, usuario_id, usuario_nombre
                ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const ventaValues = [
                ventaData.cliente_nombre,
                ventaData.cliente_direccion,
                ventaData.cliente_telefono,
                ventaData.cliente_email,
                ventaData.subtotal,
                ventaData.iva_total,
                ventaData.descuento,
                ventaData.total,
                ventaData.medio_pago,
                ventaData.cuenta_id,
                ventaData.estado,
                ventaData.observaciones,
                ventaData.tipo_factura,
                usuario.id || null,
                usuario.nombre || usuario.usuario || null
            ];
            
            const [ventaResult] = await connection.execute(ventaQuery, ventaValues);
            const ventaId = ventaResult.insertId;
            
            // Insertar artículos de la venta
            const articuloQuery = `
                INSERT INTO ventas_contenido (
                    venta_id, articulo_id, articulo_nombre, cantidad, precio, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            for (const articulo of articulos) {
                await connection.execute(articuloQuery, [
                    ventaId,
                    articulo.articulo_id,
                    articulo.articulo_nombre,
                    articulo.cantidad,
                    articulo.precio,
                    articulo.subtotal
                ]);
                
                // Actualizar stock del artículo
                await connection.execute(
                    'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ?',
                    [articulo.cantidad, articulo.articulo_id]
                );
            }
            
            // Si hay cuenta_id, actualizar saldo
            if (ventaData.cuenta_id) {
                // Obtener saldo anterior antes de actualizar
                const [saldoAnterior] = await connection.execute(
                    'SELECT saldo FROM cuentas_fondos WHERE id = ?',
                    [ventaData.cuenta_id]
                );
                
                const saldoAnteriorValor = parseFloat(saldoAnterior[0].saldo) || 0;
                const saldoNuevoValor = saldoAnteriorValor + parseFloat(ventaData.total);
                
                // Actualizar saldo
                await connection.execute(
                    'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
                    [saldoNuevoValor, ventaData.cuenta_id]
                );
                
                // Registrar movimiento
                await connection.execute(
                    `INSERT INTO movimientos_fondos (
                        fecha, cuenta_id, tipo, origen, referencia_id, monto,
                        saldo_anterior, saldo_nuevo
                    ) VALUES (NOW(), ?, 'INGRESO', ?, ?, ?, ?, ?)`,
                    [
                        ventaData.cuenta_id,
                        `Venta #${ventaId}`,
                        ventaId,
                        ventaData.total,
                        saldoAnteriorValor,
                        saldoNuevoValor
                    ]
                );
            }
            
            await connection.commit();
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'ventas',
                registroId: ventaId,
                datosNuevos: { ventaId, ...ventaData, articulos: articulos.length },
                detallesAdicionales: `Venta creada - Cliente: ${ventaData.cliente_nombre || 'N/A'} - Total: $${ventaData.total}`
            });
            
            res.status(201).json({
                success: true,
                message: 'Venta creada exitosamente',
                data: { id: ventaId, ...ventaData }
            });
            
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al crear venta:', error);
            
            await auditarOperacion(req, {
                accion: 'INSERT',
                tabla: 'ventas',
                estado: 'FALLIDO',
                detallesAdicionales: `Error al crear venta: ${error.message}`
            });
            
            res.status(500).json({
                success: false,
                message: 'Error al crear venta',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            connection.release();
        }
};

/**
 * Obtener todas las ventas
 * GET /ventas
 */
const obtenerVentas = async (req, res) => {
    try {
        const { estado, fecha_desde, fecha_hasta, cuenta_id } = req.query;
        
        let query = 'SELECT * FROM ventas WHERE 1=1';
        const params = [];
        
        if (estado) {
            query += ' AND estado = ?';
            params.push(estado);
        }
        
        if (cuenta_id) {
            query += ' AND cuenta_id = ?';
            params.push(cuenta_id);
        }
        
        if (fecha_desde) {
            query += ' AND DATE(fecha) >= ?';
            params.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            query += ' AND DATE(fecha) <= ?';
            params.push(fecha_hasta);
        }
        
        query += ' ORDER BY fecha DESC';
        
        const [ventas] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: ventas
        });
    } catch (error) {
        console.error('❌ Error al obtener ventas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ventas'
        });
    }
};

/**
 * Obtener una venta por ID
 * GET /ventas/:id
 */
const obtenerVentaPorId = async (req, res) => {
        try {
            const { id } = req.validatedParams;
            
            const [ventas] = await db.execute('SELECT * FROM ventas WHERE id = ?', [id]);
            
            if (ventas.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Venta no encontrada'
                });
            }
            
            const [articulos] = await db.execute(
                'SELECT * FROM ventas_contenido WHERE venta_id = ?',
                [id]
            );
            
            res.json({
                success: true,
                data: {
                    venta: ventas[0],
                    articulos
                }
            });
        } catch (error) {
            console.error('❌ Error al obtener venta:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener venta'
            });
        }
};

/**
 * Anular una venta
 * PUT /ventas/:id/anular
 */
const anularVenta = async (req, res) => {
        const connection = await db.getConnection();
        
        try {
            const { id } = req.validatedParams || req.params;
            const { motivo } = req.validatedData || req.body;
            
            // Obtener datos anteriores
            const datosAnteriores = await obtenerDatosAnteriores('ventas', id);
            
            if (!datosAnteriores) {
                return res.status(404).json({
                    success: false,
                    message: 'Venta no encontrada'
                });
            }
            
            if (datosAnteriores.estado === 'ANULADA') {
                return res.status(400).json({
                    success: false,
                    message: 'La venta ya está anulada'
                });
            }
            
            await connection.beginTransaction();
            
            // Actualizar estado
            await connection.execute(
                'UPDATE ventas SET estado = ? WHERE id = ?',
                ['ANULADA', id]
            );
            
            // Obtener artículos para restaurar stock
            const [articulos] = await connection.execute(
                'SELECT articulo_id, cantidad FROM ventas_contenido WHERE venta_id = ?',
                [id]
            );
            
            // Restaurar stock
            for (const articulo of articulos) {
                await connection.execute(
                    'UPDATE articulos SET stock_actual = stock_actual + ? WHERE id = ?',
                    [articulo.cantidad, articulo.articulo_id]
                );
            }
            
            // Si tenía cuenta, revertir saldo
            if (datosAnteriores.cuenta_id) {
                // Obtener saldo anterior antes de actualizar
                const [saldoAnterior] = await connection.execute(
                    'SELECT saldo FROM cuentas_fondos WHERE id = ?',
                    [datosAnteriores.cuenta_id]
                );
                
                const saldoAnteriorValor = parseFloat(saldoAnterior[0].saldo) || 0;
                const saldoNuevoValor = saldoAnteriorValor - parseFloat(datosAnteriores.total);
                
                // Actualizar saldo
                await connection.execute(
                    'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
                    [saldoNuevoValor, datosAnteriores.cuenta_id]
                );
                
                // Registrar movimiento de reversión
                await connection.execute(
                    `INSERT INTO movimientos_fondos (
                        fecha, cuenta_id, tipo, origen, referencia_id, monto,
                        saldo_anterior, saldo_nuevo
                    ) VALUES (NOW(), ?, 'EGRESO', ?, ?, ?, ?, ?)`,
                    [
                        datosAnteriores.cuenta_id,
                        `Anulación Venta #${id}`,
                        id,
                        datosAnteriores.total,
                        saldoAnteriorValor,
                        saldoNuevoValor
                    ]
                );
            }
            
            await connection.commit();
            
            // Auditoría
            await auditarOperacion(req, {
                accion: 'UPDATE',
                tabla: 'ventas',
                registroId: id,
                datosAnteriores,
                datosNuevos: { ...datosAnteriores, estado: 'ANULADA' },
                detallesAdicionales: `Venta anulada${motivo ? ` - Motivo: ${motivo}` : ''}`
            });
            
            res.json({
                success: true,
                message: 'Venta anulada correctamente'
            });
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error al anular venta:', error);
            res.status(500).json({
                success: false,
                message: 'Error al anular venta'
            });
        } finally {
            connection.release();
        }
};

module.exports = {
    crearVenta,
    obtenerVentas,
    obtenerVentaPorId,
    anularVenta
};

