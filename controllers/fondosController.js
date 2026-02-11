// controllers/fondosController.js - Sistema Chalito - Módulo de Fondos
const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

// =====================================================
// GESTIÓN DE CUENTAS DE FONDOS
// =====================================================

/**
 * Obtener todas las cuentas de fondos
 * GET /fondos/cuentas
 */
const obtenerCuentas = async (req, res) => {
    try {
        console.log('💰 Obteniendo cuentas de fondos...');
        
        const [cuentas] = await db.execute(
            `SELECT 
                id, nombre, descripcion, saldo, activa, fecha_creacion
            FROM cuentas_fondos
            ORDER BY activa DESC, nombre ASC`
        );
        
        // Calcular total
        const total = cuentas.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo || 0), 0);
        
        console.log(`✅ Cuentas encontradas: ${cuentas.length}, Total: $${total}`);
        
        res.json({
            success: true,
            data: cuentas,
            meta: {
                total_cuentas: cuentas.length,
                total_saldo: total,
                cuentas_activas: cuentas.filter(c => c.activa).length
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener cuentas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cuentas de fondos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener una cuenta por ID
 * GET /fondos/cuentas/:id
 */
const obtenerCuentaPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        console.log(`🔍 Obteniendo cuenta ID: ${id}`);
        
        const [cuentas] = await db.execute(
            `SELECT 
                id, nombre, descripcion, saldo, activa, fecha_creacion
            FROM cuentas_fondos
            WHERE id = ?`,
            [id]
        );
        
        if (cuentas.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada'
            });
        }
        
        res.json({
            success: true,
            data: cuentas[0]
        });
        
    } catch (error) {
        console.error('❌ Error al obtener cuenta:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cuenta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Crear una nueva cuenta de fondos
 * POST /fondos/cuentas
 */
const crearCuenta = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('💰 Creando nueva cuenta de fondos...');
        
        const { nombre, descripcion, saldo_inicial = 0 } = req.validatedData || req.body;
        const usuario = req.user || {};
        
        // Validar que el nombre no exista
        const [existentes] = await connection.execute(
            'SELECT id FROM cuentas_fondos WHERE nombre = ?',
            [nombre]
        );
        
        if (existentes.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Ya existe una cuenta con ese nombre'
            });
        }
        
        // Crear la cuenta
        const [result] = await connection.execute(
            `INSERT INTO cuentas_fondos (nombre, descripcion, saldo, activa)
            VALUES (?, ?, ?, 1)`,
            [nombre, descripcion || null, parseFloat(saldo_inicial) || 0]
        );
        
        const cuentaId = result.insertId;
        
        // Si hay saldo inicial, crear movimiento
        if (saldo_inicial > 0) {
            await connection.execute(
                `INSERT INTO movimientos_fondos (
                    fecha, cuenta_id, tipo, origen, monto,
                    saldo_anterior, saldo_nuevo, observaciones
                ) VALUES (NOW(), ?, 'INGRESO', 'Saldo inicial', ?, 0, ?, ?)`,
                [
                    cuentaId,
                    saldo_inicial,
                    saldo_inicial,
                    `Saldo inicial de la cuenta ${nombre}`
                ]
            );
        }
        
        await connection.commit();
        
        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            registroId: cuentaId,
            datosNuevos: limpiarDatosSensibles({
                cuentaId,
                nombre,
                saldo_inicial
            }),
            detallesAdicionales: `Cuenta creada - ${nombre} - Saldo inicial: $${saldo_inicial}`
        });
        
        console.log(`✅ Cuenta creada: ID ${cuentaId} - ${nombre}`);
        
        // Obtener la cuenta creada
        const [cuentas] = await db.execute(
            'SELECT id, nombre, descripcion, saldo, activa, fecha_creacion FROM cuentas_fondos WHERE id = ?',
            [cuentaId]
        );
        
        res.status(201).json({
            success: true,
            message: 'Cuenta creada exitosamente',
            data: cuentas[0]
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al crear cuenta:', error);
        
        await auditarOperacion(req, {
            accion: 'CREATE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al crear cuenta: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al crear cuenta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Actualizar una cuenta de fondos
 * PUT /fondos/cuentas/:id
 */
const actualizarCuenta = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const { id } = req.validatedParams || req.params;
        const { nombre, descripcion, activa } = req.validatedData || req.body;
        
        console.log(`✏️ Actualizando cuenta ID: ${id}`);
        
        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('cuentas_fondos', id);
        
        if (!datosAnteriores) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada'
            });
        }
        
        // Validar que el nombre no exista en otra cuenta
        if (nombre && nombre !== datosAnteriores.nombre) {
            const [existentes] = await connection.execute(
                'SELECT id FROM cuentas_fondos WHERE nombre = ? AND id != ?',
                [nombre, id]
            );
            
            if (existentes.length > 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe otra cuenta con ese nombre'
                });
            }
        }
        
        // Actualizar cuenta
        const updateFields = [];
        const updateValues = [];
        
        if (nombre !== undefined) {
            updateFields.push('nombre = ?');
            updateValues.push(nombre);
        }
        if (descripcion !== undefined) {
            updateFields.push('descripcion = ?');
            updateValues.push(descripcion || null);
        }
        if (activa !== undefined) {
            updateFields.push('activa = ?');
            updateValues.push(activa ? 1 : 0);
        }
        
        if (updateFields.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'No hay campos para actualizar'
            });
        }
        
        updateValues.push(id);
        
        await connection.execute(
            `UPDATE cuentas_fondos SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );
        
        await connection.commit();
        
        // Auditar actualización
        await auditarOperacion(req, {
            accion: 'UPDATE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles({
                ...datosAnteriores,
                nombre: nombre !== undefined ? nombre : datosAnteriores.nombre,
                descripcion: descripcion !== undefined ? descripcion : datosAnteriores.descripcion,
                activa: activa !== undefined ? activa : datosAnteriores.activa
            }),
            detallesAdicionales: `Cuenta actualizada - ${nombre || datosAnteriores.nombre}`
        });
        
        console.log(`✅ Cuenta actualizada: ID ${id}`);
        
        // Obtener la cuenta actualizada
        const [cuentas] = await db.execute(
            'SELECT id, nombre, descripcion, saldo, activa, fecha_creacion FROM cuentas_fondos WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Cuenta actualizada exitosamente',
            data: cuentas[0]
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al actualizar cuenta:', error);
        
        await auditarOperacion(req, {
            accion: 'UPDATE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al actualizar cuenta: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al actualizar cuenta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Eliminar una cuenta de fondos (soft delete)
 * DELETE /fondos/cuentas/:id
 */
const eliminarCuenta = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const { id } = req.validatedParams || req.params;
        
        console.log(`🗑️ Eliminando cuenta ID: ${id}`);
        
        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('cuentas_fondos', id);
        
        if (!datosAnteriores) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada'
            });
        }
        
        // Verificar dependencias (ventas, gastos, movimientos)
        const [ventas] = await connection.execute(
            'SELECT COUNT(*) as count FROM ventas WHERE cuenta_id = ?',
            [id]
        );
        
        const [gastos] = await connection.execute(
            'SELECT COUNT(*) as count FROM gastos WHERE cuenta_id = ?',
            [id]
        );
        
        const [movimientos] = await connection.execute(
            'SELECT COUNT(*) as count FROM movimientos_fondos WHERE cuenta_id = ?',
            [id]
        );
        
        const totalDependencias = parseInt(ventas[0].count) + parseInt(gastos[0].count) + parseInt(movimientos[0].count);
        
        if (totalDependencias > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: `No se puede eliminar la cuenta porque tiene ${totalDependencias} registro(s) asociado(s) (ventas, gastos o movimientos)`,
                dependencias: {
                    ventas: parseInt(ventas[0].count),
                    gastos: parseInt(gastos[0].count),
                    movimientos: parseInt(movimientos[0].count)
                }
            });
        }
        
        // Soft delete (marcar como inactiva)
        await connection.execute(
            'UPDATE cuentas_fondos SET activa = 0 WHERE id = ?',
            [id]
        );
        
        await connection.commit();
        
        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Cuenta eliminada (soft delete) - ${datosAnteriores.nombre}`
        });
        
        console.log(`✅ Cuenta eliminada: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Cuenta eliminada exitosamente'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al eliminar cuenta:', error);
        
        await auditarOperacion(req, {
            accion: 'DELETE_CUENTA_FONDO',
            tabla: 'cuentas_fondos',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al eliminar cuenta: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cuenta',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

// =====================================================
// GESTIÓN DE MOVIMIENTOS DE FONDOS
// =====================================================

/**
 * Obtener movimientos de una cuenta
 * GET /fondos/cuentas/:id/movimientos
 */
const obtenerMovimientos = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { 
            fecha_desde, 
            fecha_hasta, 
            tipo,
            limit = 50,
            page = 1
        } = req.query;
        
        console.log(`📊 Obteniendo movimientos de cuenta ID: ${id}`);
        
        // Verificar que la cuenta existe
        const [cuentas] = await db.execute(
            'SELECT id, nombre FROM cuentas_fondos WHERE id = ?',
            [id]
        );
        
        if (cuentas.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada'
            });
        }
        
        let whereConditions = ['cuenta_id = ?'];
        let queryParams = [id];
        
        // Filtro por fecha desde
        if (fecha_desde) {
            whereConditions.push('DATE(fecha) >= ?');
            queryParams.push(fecha_desde);
        }
        
        // Filtro por fecha hasta
        if (fecha_hasta) {
            whereConditions.push('DATE(fecha) <= ?');
            queryParams.push(fecha_hasta);
        }
        
        // Filtro por tipo
        if (tipo) {
            whereConditions.push('tipo = ?');
            queryParams.push(tipo);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Query principal
        const limiteNum = Math.min(parseInt(limit) || 50, 100);
        const paginaNum = Math.max(parseInt(page) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;
        
        const query = `
            SELECT 
                id, fecha, tipo, origen, referencia_id,
                monto, saldo_anterior, saldo_nuevo, observaciones
            FROM movimientos_fondos
            WHERE ${whereClause}
            ORDER BY fecha DESC, id DESC
            LIMIT ${limiteNum} OFFSET ${offset}
        `;
        
        const [movimientos] = await db.execute(query, queryParams);
        
        // Query de conteo
        const queryCount = `
            SELECT COUNT(*) as total 
            FROM movimientos_fondos
            WHERE ${whereClause}
        `;
        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;
        
        console.log(`✅ Movimientos encontrados: ${movimientos.length}, Total: ${total}`);
        
        res.json({
            success: true,
            data: movimientos,
            meta: {
                cuenta: cuentas[0],
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener movimientos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener movimientos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Registrar un movimiento manual (ingreso o egreso)
 * POST /fondos/movimientos
 */
const registrarMovimiento = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('💰 Registrando movimiento manual...');
        
        const {
            cuenta_id,
            tipo,
            monto,
            observaciones
        } = req.validatedData || req.body;
        
        const usuario = req.user || {};
        
        // Validar tipo
        if (!['INGRESO', 'EGRESO'].includes(tipo)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'Tipo de movimiento inválido. Debe ser INGRESO o EGRESO'
            });
        }
        
        // Validar monto
        const montoNum = parseFloat(monto);
        if (isNaN(montoNum) || montoNum <= 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'El monto debe ser un número positivo'
            });
        }
        
        // Verificar que la cuenta existe y está activa
        const [cuentas] = await connection.execute(
            'SELECT id, nombre, saldo FROM cuentas_fondos WHERE id = ? AND activa = 1',
            [cuenta_id]
        );
        
        if (cuentas.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada o inactiva'
            });
        }
        
        const cuenta = cuentas[0];
        const saldoAnterior = parseFloat(cuenta.saldo) || 0;
        
        // Calcular nuevo saldo
        let saldoNuevo;
        if (tipo === 'INGRESO') {
            saldoNuevo = saldoAnterior + montoNum;
        } else {
            saldoNuevo = saldoAnterior - montoNum;
            
            // Validar que no quede saldo negativo
            if (saldoNuevo < 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `Saldo insuficiente. Saldo actual: $${saldoAnterior.toFixed(2)}`
                });
            }
        }
        
        // Actualizar saldo de la cuenta
        await connection.execute(
            'UPDATE cuentas_fondos SET saldo = ? WHERE id = ?',
            [saldoNuevo, cuenta_id]
        );
        
        // Registrar movimiento
        const [movimientoResult] = await connection.execute(
            `INSERT INTO movimientos_fondos (
                fecha, cuenta_id, tipo, origen, monto,
                saldo_anterior, saldo_nuevo, observaciones
            ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)`,
            [
                cuenta_id,
                tipo,
                'Movimiento manual',
                null,
                montoNum,
                saldoAnterior,
                saldoNuevo,
                observaciones || null
            ]
        );
        
        const movimientoId = movimientoResult.insertId;
        
        await connection.commit();
        
        // Auditar movimiento
        await auditarOperacion(req, {
            accion: 'CREATE_MOVIMIENTO_FONDO',
            tabla: 'movimientos_fondos',
            registroId: movimientoId,
            datosNuevos: limpiarDatosSensibles({
                movimientoId,
                cuenta_id,
                tipo,
                monto: montoNum,
                saldo_anterior: saldoAnterior,
                saldo_nuevo: saldoNuevo
            }),
            detallesAdicionales: `Movimiento ${tipo} manual - Cuenta: ${cuenta.nombre} - Monto: $${montoNum}`
        });
        
        console.log(`✅ Movimiento registrado: ID ${movimientoId} - ${tipo} $${montoNum}`);
        
        // Obtener el movimiento creado
        const [movimientos] = await connection.execute(
            `SELECT 
                id, fecha, tipo, origen, referencia_id,
                monto, saldo_anterior, saldo_nuevo, observaciones
            FROM movimientos_fondos
            WHERE id = ?`,
            [movimientoId]
        );
        
        res.status(201).json({
            success: true,
            message: `Movimiento ${tipo.toLowerCase()} registrado exitosamente`,
            data: movimientos[0]
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al registrar movimiento:', error);
        
        await auditarOperacion(req, {
            accion: 'CREATE_MOVIMIENTO_FONDO',
            tabla: 'movimientos_fondos',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al registrar movimiento: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al registrar movimiento',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Obtener historial unificado de movimientos (ventas, gastos, movimientos manuales)
 * GET /fondos/cuentas/:id/historial
 */
const obtenerHistorialUnificado = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { 
            fecha_desde, 
            fecha_hasta,
            limit = 50,
            page = 1
        } = req.query;
        
        // Validar y convertir ID
        const cuentaId = parseInt(id);
        if (isNaN(cuentaId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de cuenta inválido'
            });
        }
        
        console.log(`📊 Obteniendo historial unificado de cuenta ID: ${cuentaId}`);
        
        // Verificar que la cuenta existe
        const [cuentas] = await db.execute(
            'SELECT id, nombre, saldo FROM cuentas_fondos WHERE id = ?',
            [cuentaId]
        );
        
        if (cuentas.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cuenta no encontrada'
            });
        }
        
        const limiteNum = Math.min(parseInt(limit) || 50, 100);
        const paginaNum = Math.max(parseInt(page) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;
        
        // Construir query y parámetros dinámicamente
        let query = '';
        const queryParams = [];
        
        // Construir cada parte del UNION ALL con sus propios parámetros
        // 1. Movimientos
        query += `
            SELECT 
                'MOVIMIENTO' as origen_tipo,
                m.id as registro_id,
                m.fecha,
                m.tipo,
                m.origen as descripcion,
                m.monto,
                m.saldo_anterior,
                m.saldo_nuevo,
                m.observaciones,
                NULL as referencia_extra
            FROM movimientos_fondos m
            WHERE m.cuenta_id = ?`;
        queryParams.push(cuentaId);
        
        if (fecha_desde) {
            query += ' AND DATE(m.fecha) >= ?';
            queryParams.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            query += ' AND DATE(m.fecha) <= ?';
            queryParams.push(fecha_hasta);
        }
        
        // 2. Ventas
        query += `
            UNION ALL
            SELECT 
                'VENTA' as origen_tipo,
                v.id as registro_id,
                v.fecha,
                'INGRESO' as tipo,
                CONCAT('Venta #', v.id, ' - ', COALESCE(v.cliente_nombre, 'Consumidor Final')) as descripcion,
                v.total as monto,
                NULL as saldo_anterior,
                NULL as saldo_nuevo,
                v.observaciones,
                v.estado as referencia_extra
            FROM ventas v
            WHERE v.cuenta_id = ? AND v.estado = 'FACTURADA'`;
        queryParams.push(cuentaId);
        
        if (fecha_desde) {
            query += ' AND DATE(v.fecha) >= ?';
            queryParams.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            query += ' AND DATE(v.fecha) <= ?';
            queryParams.push(fecha_hasta);
        }
        
        // 3. Gastos
        query += `
            UNION ALL
            SELECT 
                'GASTO' as origen_tipo,
                g.id as registro_id,
                g.fecha,
                'EGRESO' as tipo,
                CONCAT('Gasto: ', g.descripcion) as descripcion,
                g.monto,
                NULL as saldo_anterior,
                NULL as saldo_nuevo,
                g.observaciones,
                g.categoria_nombre as referencia_extra
            FROM gastos g
            WHERE g.cuenta_id = ?`;
        queryParams.push(cuentaId);
        
        if (fecha_desde) {
            query += ' AND DATE(g.fecha) >= ?';
            queryParams.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            query += ' AND DATE(g.fecha) <= ?';
            queryParams.push(fecha_hasta);
        }
        
        // ORDER BY, LIMIT y OFFSET
        query += `
            ORDER BY fecha DESC, registro_id DESC
            LIMIT ? OFFSET ?`;
        queryParams.push(limiteNum, offset);
        
        console.log(`🔍 Query params (${queryParams.length}):`, queryParams);
        console.log(`🔍 Query:`, query.replace(/\s+/g, ' ').trim());
        
        const [historial] = await db.execute(query, queryParams);
        
        // Query de conteo (simplificado) - construir dinámicamente
        let queryCountMov = 'SELECT COUNT(*) as count FROM movimientos_fondos WHERE cuenta_id = ?';
        const paramsCountMov = [cuentaId];
        if (fecha_desde) {
            queryCountMov += ' AND DATE(fecha) >= ?';
            paramsCountMov.push(fecha_desde);
        }
        if (fecha_hasta) {
            queryCountMov += ' AND DATE(fecha) <= ?';
            paramsCountMov.push(fecha_hasta);
        }
        const [countMov] = await db.execute(queryCountMov, paramsCountMov);
        
        let queryCountVent = 'SELECT COUNT(*) as count FROM ventas WHERE cuenta_id = ? AND estado = \'FACTURADA\'';
        const paramsCountVent = [cuentaId];
        if (fecha_desde) {
            queryCountVent += ' AND DATE(fecha) >= ?';
            paramsCountVent.push(fecha_desde);
        }
        if (fecha_hasta) {
            queryCountVent += ' AND DATE(fecha) <= ?';
            paramsCountVent.push(fecha_hasta);
        }
        const [countVent] = await db.execute(queryCountVent, paramsCountVent);
        
        let queryCountGas = 'SELECT COUNT(*) as count FROM gastos WHERE cuenta_id = ?';
        const paramsCountGas = [cuentaId];
        if (fecha_desde) {
            queryCountGas += ' AND DATE(fecha) >= ?';
            paramsCountGas.push(fecha_desde);
        }
        if (fecha_hasta) {
            queryCountGas += ' AND DATE(fecha) <= ?';
            paramsCountGas.push(fecha_hasta);
        }
        const [countGas] = await db.execute(queryCountGas, paramsCountGas);
        
        const total = (countMov[0]?.count || 0) + (countVent[0]?.count || 0) + (countGas[0]?.count || 0);
        
        console.log(`✅ Historial encontrado: ${historial.length} registros, Total: ${total}`);
        
        res.json({
            success: true,
            data: historial,
            meta: {
                cuenta: cuentas[0],
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener historial:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error errno:', error.errno);
        console.error('❌ Error sqlMessage:', error.sqlMessage);
        
        res.status(500).json({
            success: false,
            message: 'Error al obtener historial',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                errno: error.errno,
                sqlMessage: error.sqlMessage
            } : undefined
        });
    }
};

module.exports = {
    // Cuentas
    obtenerCuentas,
    obtenerCuentaPorId,
    crearCuenta,
    actualizarCuenta,
    eliminarCuenta,
    
    // Movimientos
    obtenerMovimientos,
    registrarMovimiento,
    obtenerHistorialUnificado
};

