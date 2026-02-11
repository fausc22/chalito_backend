// controllers/ventasController.js - Sistema Chalito - Módulo de Ventas
const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

// =====================================================
// GESTIÓN DE VENTAS
// =====================================================

/**
 * Crear una nueva venta
 * POST /ventas
 */
const crearVenta = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('💳 Creando nueva venta...');
        
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
            ventaData.cliente_nombre || null,
            ventaData.cliente_direccion || null,
            ventaData.cliente_telefono || null,
            ventaData.cliente_email || null,
            ventaData.subtotal,
            ventaData.iva_total || 0,
            ventaData.descuento || 0,
            ventaData.total,
            ventaData.medio_pago || 'EFECTIVO',
            ventaData.cuenta_id || null,
            ventaData.estado || 'FACTURADA',
            ventaData.observaciones || null,
            ventaData.tipo_factura || null,
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
        
        // Si hay cuenta_id, actualizar saldo y registrar movimiento
        if (ventaData.cuenta_id) {
            const [saldoAnterior] = await connection.execute(
                'SELECT saldo FROM cuentas_fondos WHERE id = ?',
                [ventaData.cuenta_id]
            );
            
            const saldoAnteriorValor = parseFloat(saldoAnterior[0]?.saldo) || 0;
            const saldoNuevoValor = saldoAnteriorValor + parseFloat(ventaData.total);
            
            // Actualizar saldo
            await connection.execute(
                'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
                [saldoNuevoValor, ventaData.cuenta_id]
            );
            
            // Registrar movimiento de ingreso
            await connection.execute(
                `INSERT INTO movimientos_fondos (
                    fecha, cuenta_id, tipo, origen, referencia_id, monto,
                    saldo_anterior, saldo_nuevo, observaciones
                ) VALUES (NOW(), ?, 'INGRESO', ?, ?, ?, ?, ?, ?)`,
                [
                    ventaData.cuenta_id,
                    `Venta #${ventaId}`,
                    ventaId,
                    ventaData.total,
                    saldoAnteriorValor,
                    saldoNuevoValor,
                    `Venta - Cliente: ${ventaData.cliente_nombre || 'Consumidor Final'}`
                ]
            );
        }
        
        await connection.commit();
        
        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_VENTA',
            tabla: 'ventas',
            registroId: ventaId,
            datosNuevos: limpiarDatosSensibles({
                ventaId,
                cliente: ventaData.cliente_nombre,
                total: ventaData.total,
                articulos: articulos.length
            }),
            detallesAdicionales: `Venta creada - Cliente: ${ventaData.cliente_nombre || 'Consumidor Final'} - Total: $${ventaData.total}`
        });
        
        console.log(`✅ Venta creada: ID ${ventaId} - $${ventaData.total}`);
        
        res.status(201).json({
            success: true,
            message: 'Venta creada exitosamente',
            data: { id: ventaId, ...ventaData }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al crear venta:', error);
        
        await auditarOperacion(req, {
            accion: 'CREATE_VENTA',
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
 * Obtener todas las ventas con filtros y paginación
 * GET /ventas
 */
const obtenerVentas = async (req, res) => {
    try {
        console.log('🔍 Obteniendo ventas...');
        
        const {
            fecha_desde,
            fecha_hasta,
            month,
            year,
            estado,
            medio_pago,
            cuenta_id,
            busqueda,
            limit = 20,
            page = 1
        } = req.query;
        
        let whereConditions = ['1=1'];
        let queryParams = [];
        
        // Filtro por mes/año (prioritario sobre fecha_desde/fecha_hasta)
        if (month && month !== 'all' && year) {
            // Mes específico del año
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            if (monthNum >= 1 && monthNum <= 12 && yearNum > 0) {
                const firstDay = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
                const lastDay = new Date(yearNum, monthNum, 0).toISOString().split('T')[0];
                whereConditions.push('DATE(v.fecha) >= ?');
                whereConditions.push('DATE(v.fecha) <= ?');
                queryParams.push(firstDay, lastDay);
            }
        } else if ((month === 'all' || !month) && year) {
            // Todos los meses del año (month === 'all' o no se especifica mes)
            const yearNum = parseInt(year);
            if (yearNum > 0) {
                const firstDay = `${yearNum}-01-01`;
                const lastDay = `${yearNum}-12-31`;
                whereConditions.push('DATE(v.fecha) >= ?');
                whereConditions.push('DATE(v.fecha) <= ?');
                queryParams.push(firstDay, lastDay);
            }
        } else {
            // Filtro por fecha desde (solo si no se usa month/year)
            if (fecha_desde) {
                whereConditions.push('DATE(v.fecha) >= ?');
                queryParams.push(fecha_desde);
            }
            
            // Filtro por fecha hasta (solo si no se usa month/year)
            if (fecha_hasta) {
                whereConditions.push('DATE(v.fecha) <= ?');
                queryParams.push(fecha_hasta);
            }
        }
        
        // Filtro por estado
        if (estado) {
            whereConditions.push('v.estado = ?');
            queryParams.push(estado);
        }
        
        // Filtro por medio de pago
        if (medio_pago) {
            whereConditions.push('v.medio_pago = ?');
            queryParams.push(medio_pago);
        }
        
        // Filtro por cuenta
        if (cuenta_id) {
            whereConditions.push('v.cuenta_id = ?');
            queryParams.push(parseInt(cuenta_id));
        }
        
        // Búsqueda por cliente o número de venta
        if (busqueda) {
            whereConditions.push('(v.cliente_nombre LIKE ? OR v.cliente_telefono LIKE ? OR v.id = ?)');
            const searchTerm = `%${busqueda}%`;
            queryParams.push(searchTerm, searchTerm, parseInt(busqueda) || 0);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Query principal con JOINs
        let query = `
            SELECT 
                v.id, v.fecha, v.cliente_nombre, v.cliente_telefono,
                v.cliente_direccion, v.cliente_email,
                v.subtotal, v.iva_total, v.descuento, v.total,
                v.medio_pago, v.estado, v.observaciones,
                v.tipo_factura, v.cae_id, v.cae_fecha,
                v.usuario_id, v.usuario_nombre, v.cuenta_id,
                v.fecha_modificacion,
                cf.nombre as cuenta_nombre
            FROM ventas v
            LEFT JOIN cuentas_fondos cf ON v.cuenta_id = cf.id
            WHERE ${whereClause}
            ORDER BY v.fecha DESC, v.id DESC
        `;
        
        // Paginación (máximo 20 por página)
        const limiteNum = Math.min(parseInt(limit) || 20, 20);
        const paginaNum = Math.max(parseInt(page) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;
        
        query += ` LIMIT ${limiteNum} OFFSET ${offset}`;
        
        const [ventas] = await db.execute(query, queryParams);
        
        // Query de conteo total
        const queryCount = `
            SELECT COUNT(*) as total 
            FROM ventas v
            WHERE ${whereClause}
        `;
        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;
        
        // Query de suma total de montos
        const querySum = `
            SELECT 
                COALESCE(SUM(total), 0) as total_monto,
                COALESCE(SUM(CASE WHEN estado = 'FACTURADA' THEN total ELSE 0 END), 0) as total_facturado,
                COALESCE(SUM(CASE WHEN estado = 'ANULADA' THEN total ELSE 0 END), 0) as total_anulado
            FROM ventas v
            WHERE ${whereClause}
        `;
        const [sumResult] = await db.execute(querySum, queryParams);
        const totales = sumResult[0];
        
        console.log(`✅ Ventas encontradas: ${ventas.length}, Total: ${total}`);
        
        res.json({
            success: true,
            data: ventas,
            meta: {
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum,
                hay_mas: (paginaNum * limiteNum) < total,
                total_monto: parseFloat(totales.total_monto) || 0,
                total_facturado: parseFloat(totales.total_facturado) || 0,
                total_anulado: parseFloat(totales.total_anulado) || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener ventas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ventas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener una venta por ID con detalle completo
 * GET /ventas/:id
 */
const obtenerVentaPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        console.log(`🔍 Obteniendo venta ID: ${id}`);
        
        // Query de la venta con JOINs
        const queryVenta = `
            SELECT 
                v.id, v.fecha, v.cliente_nombre, v.cliente_telefono,
                v.cliente_direccion, v.cliente_email,
                v.subtotal, v.iva_total, v.descuento, v.total,
                v.medio_pago, v.estado, v.observaciones,
                v.tipo_factura, v.cae_id, v.cae_fecha,
                v.usuario_id, v.usuario_nombre, v.cuenta_id,
                v.fecha_modificacion,
                cf.nombre as cuenta_nombre
            FROM ventas v
            LEFT JOIN cuentas_fondos cf ON v.cuenta_id = cf.id
            WHERE v.id = ?
        `;
        
        const [ventas] = await db.execute(queryVenta, [id]);
        
        if (ventas.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Venta no encontrada'
            });
        }
        
        // Obtener artículos de la venta
        const queryArticulos = `
            SELECT 
                vc.id, vc.articulo_id, vc.articulo_nombre,
                vc.cantidad, vc.precio, vc.subtotal,
                a.codigo_barra, a.categoria_id
            FROM ventas_contenido vc
            LEFT JOIN articulos a ON vc.articulo_id = a.id
            WHERE vc.venta_id = ?
            ORDER BY vc.id
        `;
        
        const [articulos] = await db.execute(queryArticulos, [id]);
        
        console.log(`✅ Venta encontrada: ID ${id} con ${articulos.length} artículos`);
        
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
            message: 'Error al obtener venta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        
        console.log(`🚫 Anulando venta ID: ${id}`);
        
        // Obtener datos anteriores de la venta
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
        
        // Actualizar estado de la venta
        const observacionAnulacion = motivo 
            ? `${datosAnteriores.observaciones || ''} | ANULADA: ${motivo}`.trim()
            : datosAnteriores.observaciones;
            
        await connection.execute(
            'UPDATE ventas SET estado = ?, observaciones = ? WHERE id = ?',
            ['ANULADA', observacionAnulacion, id]
        );
        
        // Obtener artículos para restaurar stock
        const [articulos] = await connection.execute(
            'SELECT articulo_id, cantidad FROM ventas_contenido WHERE venta_id = ?',
            [id]
        );
        
        // Restaurar stock de cada artículo
        for (const articulo of articulos) {
            await connection.execute(
                'UPDATE articulos SET stock_actual = stock_actual + ? WHERE id = ?',
                [articulo.cantidad, articulo.articulo_id]
            );
        }
        
        // Si tenía cuenta asociada, revertir el saldo
        if (datosAnteriores.cuenta_id) {
            const [saldoActual] = await connection.execute(
                'SELECT saldo FROM cuentas_fondos WHERE id = ?',
                [datosAnteriores.cuenta_id]
            );
            
            const saldoAnteriorValor = parseFloat(saldoActual[0]?.saldo) || 0;
            const montoVenta = parseFloat(datosAnteriores.total);
            const saldoNuevoValor = saldoAnteriorValor - montoVenta;
            
            // Actualizar saldo (restar el ingreso)
            await connection.execute(
                'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
                [saldoNuevoValor, datosAnteriores.cuenta_id]
            );
            
            // Registrar movimiento de egreso (reversión)
            await connection.execute(
                `INSERT INTO movimientos_fondos (
                    fecha, cuenta_id, tipo, origen, referencia_id, monto,
                    saldo_anterior, saldo_nuevo, observaciones
                ) VALUES (NOW(), ?, 'EGRESO', ?, ?, ?, ?, ?, ?)`,
                [
                    datosAnteriores.cuenta_id,
                    `Anulación Venta #${id}`,
                    id,
                    montoVenta,
                    saldoAnteriorValor,
                    saldoNuevoValor,
                    motivo || 'Anulación de venta'
                ]
            );
        }
        
        await connection.commit();
        
        // Auditar anulación
        await auditarOperacion(req, {
            accion: 'ANULAR_VENTA',
            tabla: 'ventas',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles({ ...datosAnteriores, estado: 'ANULADA' }),
            detallesAdicionales: `Venta anulada - Total: $${datosAnteriores.total}${motivo ? ` - Motivo: ${motivo}` : ''}`
        });
        
        console.log(`✅ Venta anulada: ID ${id} - $${datosAnteriores.total}`);
        
        res.json({
            success: true,
            message: 'Venta anulada correctamente',
            data: {
                id: parseInt(id),
                estado: 'ANULADA',
                total_revertido: parseFloat(datosAnteriores.total),
                articulos_restaurados: articulos.length
            }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al anular venta:', error);
        
        await auditarOperacion(req, {
            accion: 'ANULAR_VENTA',
            tabla: 'ventas',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al anular venta: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al anular venta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Obtener resumen de ventas por período
 * GET /ventas/resumen
 */
const obtenerResumenVentas = async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;
        
        console.log('📊 Obteniendo resumen de ventas...');
        
        let whereClause = '1=1';
        const params = [];
        
        if (fecha_desde) {
            whereClause += ' AND DATE(v.fecha) >= ?';
            params.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            whereClause += ' AND DATE(v.fecha) <= ?';
            params.push(fecha_hasta);
        }
        
        // Totales generales
        const queryTotales = `
            SELECT 
                COUNT(*) as total_ventas,
                SUM(CASE WHEN estado = 'FACTURADA' THEN 1 ELSE 0 END) as ventas_facturadas,
                SUM(CASE WHEN estado = 'ANULADA' THEN 1 ELSE 0 END) as ventas_anuladas,
                COALESCE(SUM(CASE WHEN estado = 'FACTURADA' THEN total ELSE 0 END), 0) as monto_facturado,
                COALESCE(SUM(CASE WHEN estado = 'ANULADA' THEN total ELSE 0 END), 0) as monto_anulado,
                COALESCE(AVG(CASE WHEN estado = 'FACTURADA' THEN total ELSE NULL END), 0) as ticket_promedio
            FROM ventas v
            WHERE ${whereClause}
        `;
        
        const [totales] = await db.execute(queryTotales, params);
        
        // Ventas por medio de pago
        const queryPorMedioPago = `
            SELECT 
                v.medio_pago,
                COUNT(*) as cantidad,
                SUM(v.total) as monto_total
            FROM ventas v
            WHERE ${whereClause} AND v.estado = 'FACTURADA'
            GROUP BY v.medio_pago
            ORDER BY monto_total DESC
        `;
        
        const [porMedioPago] = await db.execute(queryPorMedioPago, params);
        
        // Ventas por día (últimos 7 días)
        const queryPorDia = `
            SELECT 
                DATE(v.fecha) as fecha,
                COUNT(*) as cantidad,
                SUM(v.total) as monto_total
            FROM ventas v
            WHERE ${whereClause} AND v.estado = 'FACTURADA'
            GROUP BY DATE(v.fecha)
            ORDER BY fecha DESC
            LIMIT 7
        `;
        
        const [porDia] = await db.execute(queryPorDia, params);
        
        // Artículos más vendidos
        const queryTopArticulos = `
            SELECT 
                vc.articulo_nombre,
                SUM(vc.cantidad) as cantidad_total,
                SUM(vc.subtotal) as monto_total
            FROM ventas_contenido vc
            INNER JOIN ventas v ON vc.venta_id = v.id
            WHERE ${whereClause.replace(/v\./g, 'v.')} AND v.estado = 'FACTURADA'
            GROUP BY vc.articulo_nombre
            ORDER BY cantidad_total DESC
            LIMIT 10
        `;
        
        const [topArticulos] = await db.execute(queryTopArticulos, params);
        
        console.log('✅ Resumen de ventas obtenido');
        
        res.json({
            success: true,
            data: {
                totales: totales[0],
                por_medio_pago: porMedioPago,
                por_dia: porDia.reverse(),
                top_articulos: topArticulos
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener resumen de ventas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener resumen de ventas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener medios de pago disponibles (para filtros)
 * GET /ventas/medios-pago
 */
const obtenerMediosPago = async (req, res) => {
    try {
        const [medios] = await db.execute(`
            SELECT DISTINCT medio_pago 
            FROM ventas 
            WHERE medio_pago IS NOT NULL AND medio_pago != ''
            ORDER BY medio_pago
        `);
        
        res.json({
            success: true,
            data: medios.map(m => m.medio_pago)
        });
        
    } catch (error) {
        console.error('❌ Error al obtener medios de pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener medios de pago',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    // CRUD principal
    crearVenta,
    obtenerVentas,
    obtenerVentaPorId,
    anularVenta,
    
    // Auxiliares
    obtenerResumenVentas,
    obtenerMediosPago
};
