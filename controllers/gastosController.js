// controllers/gastosController.js - Sistema Chalito - Módulo de Gastos
const db = require('./dbPromise');
const CuentasSistema = require('../services/CuentasSistemaService');
const { auditarOperacion, obtenerDatosAnteriores, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

const obtenerFechaActualYYYYMMDD = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// =====================================================
// GESTIÓN DE GASTOS
// =====================================================

/**
 * Crear un nuevo gasto
 * POST /gastos
 */
const crearGasto = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('💸 Creando nuevo gasto...');
        
        const {
            categoria_id,
            descripcion,
            monto,
            forma_pago = 'EFECTIVO',
            observaciones,
            fecha
        } = req.validatedData || req.body;

        const fechaGasto = fecha || obtenerFechaActualYYYYMMDD();

        const cuentaX = await CuentasSistema.obtenerCuentaX(connection);
        const cuenta_id = cuentaX.id;
        
        const usuario = req.user || {};
        
        // Verificar que la categoría existe y está activa
        const [categoria] = await connection.execute(
            'SELECT id, nombre FROM categoria_gastos WHERE id = ? AND activa = 1',
            [categoria_id]
        );
        
        if (categoria.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Categoría de gasto no encontrada o inactiva'
            });
        }
        
        const montoNum = parseFloat(monto);
        // Columna NOT NULL: vacío / ausente se guarda como ''
        const descripcionFinal = typeof descripcion === 'string' ? descripcion.trim() : '';
        
        // Insertar el gasto
        const queryGasto = `
            INSERT INTO gastos (
                fecha, categoria_id, categoria_nombre, descripcion, monto,
                forma_pago, observaciones, usuario_id, cuenta_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [resultGasto] = await connection.execute(queryGasto, [
            fechaGasto,
            categoria_id,
            categoria[0].nombre,
            descripcionFinal,
            montoNum,
            forma_pago,
            observaciones || null,
            usuario.id || null,
            cuenta_id
        ]);
        
        const gastoId = resultGasto.insertId;
        
        await CuentasSistema.debitarCuenta(
            connection,
            cuenta_id,
            montoNum,
            `Gasto #${gastoId} - ${categoria[0].nombre}`,
            gastoId
        );
        
        await connection.commit();
        
        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_GASTO',
            tabla: 'gastos',
            registroId: gastoId,
            datosNuevos: limpiarDatosSensibles({
                fecha: fechaGasto,
                categoria_id,
                categoria_nombre: categoria[0].nombre,
                descripcion: descripcionFinal,
                monto,
                forma_pago,
                cuenta_id
            }),
            detallesAdicionales: `Gasto registrado: ${descripcionFinal || '(sin descripción)'} - $${monto} (${categoria[0].nombre})`
        });
        
        console.log(`✅ Gasto creado: ID ${gastoId} - $${monto}`);
        
        res.status(201).json({
            success: true,
            message: 'Gasto registrado exitosamente',
            data: {
                id: gastoId,
                fecha: fechaGasto,
                categoria_id,
                categoria_nombre: categoria[0].nombre,
                descripcion: descripcionFinal,
                monto: montoNum,
                forma_pago,
                cuenta_id
            }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al crear gasto:', error);
        
        await auditarOperacion(req, {
            accion: 'CREATE_GASTO',
            tabla: 'gastos',
            estado: 'FALLIDO',
            detallesAdicionales: `Error al crear gasto: ${error.message}`
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al registrar gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Obtener todos los gastos con filtros
 * GET /gastos
 */
const obtenerGastos = async (req, res) => {
    try {
        console.log('🔍 Obteniendo gastos...');
        
        const {
            fecha_desde,
            fecha_hasta,
            month,
            year,
            categoria_id,
            forma_pago,
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
                whereConditions.push('DATE(g.fecha) >= ?');
                whereConditions.push('DATE(g.fecha) <= ?');
                queryParams.push(firstDay, lastDay);
            }
        } else if ((month === 'all' || !month) && year) {
            // Todos los meses del año (month === 'all' o no se especifica mes)
            const yearNum = parseInt(year);
            if (yearNum > 0) {
                const firstDay = `${yearNum}-01-01`;
                const lastDay = `${yearNum}-12-31`;
                whereConditions.push('DATE(g.fecha) >= ?');
                whereConditions.push('DATE(g.fecha) <= ?');
                queryParams.push(firstDay, lastDay);
            }
        } else {
            // Filtro por fecha desde (solo si no se usa month/year)
            if (fecha_desde) {
                whereConditions.push('DATE(g.fecha) >= ?');
                queryParams.push(fecha_desde);
            }
            
            // Filtro por fecha hasta (solo si no se usa month/year)
            if (fecha_hasta) {
                whereConditions.push('DATE(g.fecha) <= ?');
                queryParams.push(fecha_hasta);
            }
        }
        
        // Filtro por categoría
        if (categoria_id) {
            whereConditions.push('g.categoria_id = ?');
            queryParams.push(parseInt(categoria_id));
        }
        
        // Filtro por forma de pago
        if (forma_pago) {
            whereConditions.push('g.forma_pago = ?');
            queryParams.push(forma_pago);
        }
        
        // Búsqueda por descripción o número de gasto
        if (busqueda) {
            whereConditions.push('(g.descripcion LIKE ? OR g.id = ?)');
            const searchTerm = `%${busqueda}%`;
            queryParams.push(searchTerm, parseInt(busqueda) || 0);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Query principal
        let query = `
            SELECT 
                g.id, g.fecha, g.categoria_id, g.categoria_nombre,
                g.descripcion, g.monto, g.forma_pago, g.observaciones,
                g.usuario_id, g.fecha_modificacion,
                u.nombre as usuario_nombre
            FROM gastos g
            LEFT JOIN usuarios u ON g.usuario_id = u.id
            WHERE ${whereClause}
            ORDER BY g.fecha DESC, g.id DESC
        `;
        
        // Paginación (máximo 20 por página)
        const limiteNum = Math.min(parseInt(limit) || 20, 20);
        const paginaNum = Math.max(parseInt(page) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;
        
        query += ` LIMIT ${limiteNum} OFFSET ${offset}`;
        
        const [gastos] = await db.execute(query, queryParams);
        
        // Query de conteo
        const queryCount = `
            SELECT COUNT(*) as total 
            FROM gastos g
            WHERE ${whereClause}
        `;
        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;
        
        // Query de suma total
        const querySum = `
            SELECT COALESCE(SUM(monto), 0) as total_monto
            FROM gastos g
            WHERE ${whereClause}
        `;
        const [sumResult] = await db.execute(querySum, queryParams);
        const totalMonto = parseFloat(sumResult[0].total_monto) || 0;
        
        console.log(`✅ Gastos encontrados: ${gastos.length}, Total: ${total}`);
        
        res.json({
            success: true,
            data: gastos,
            meta: {
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum,
                hay_mas: (paginaNum * limiteNum) < total,
                total_monto: totalMonto
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener gastos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener gastos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener un gasto por ID
 * GET /gastos/:id
 */
const obtenerGastoPorId = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        const query = `
            SELECT 
                g.id, g.fecha, g.categoria_id, g.categoria_nombre,
                g.descripcion, g.monto, g.forma_pago, g.observaciones,
                g.usuario_id, g.fecha_modificacion,
                u.nombre as usuario_nombre
            FROM gastos g
            LEFT JOIN usuarios u ON g.usuario_id = u.id
            WHERE g.id = ?
        `;
        
        const [gastos] = await db.execute(query, [id]);
        
        if (gastos.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Gasto no encontrado'
            });
        }
        
        res.json({
            success: true,
            data: gastos[0]
        });
        
    } catch (error) {
        console.error('❌ Error al obtener gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar un gasto existente
 * PUT /gastos/:id
 */
const editarGasto = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.validatedParams || req.params;
        const {
            categoria_id,
            descripcion,
            monto,
            forma_pago,
            observaciones,
            fecha
        } = req.validatedData || req.body;
        
        console.log(`✏️ Editando gasto ID: ${id}`);
        
        const [gastoAnterior] = await connection.execute(
            'SELECT * FROM gastos WHERE id = ?',
            [id]
        );
        
        if (gastoAnterior.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Gasto no encontrado'
            });
        }
        
        const datosAnteriores = gastoAnterior[0];
        const montoAnterior = parseFloat(datosAnteriores.monto);
        const cuentaIdAnterior = datosAnteriores.cuenta_id;
        const cuentaX = await CuentasSistema.obtenerCuentaX(connection);
        const cuentaIdFinal = cuentaX.id;
        
        if (!cuentaIdAnterior) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'El gasto no tiene cuenta asociada. No se puede editar correctamente.'
            });
        }
        
        const montoFinal = monto !== undefined ? parseFloat(monto) : montoAnterior;
        const cambioMonto = monto !== undefined && montoFinal !== montoAnterior;
        const necesitaAjusteFondos = cambioMonto || cuentaIdAnterior !== cuentaIdFinal;
        
        let categoriaNombre = datosAnteriores.categoria_nombre;
        if (categoria_id && categoria_id !== datosAnteriores.categoria_id) {
            const [categoria] = await connection.execute(
                'SELECT id, nombre FROM categoria_gastos WHERE id = ? AND activa = 1',
                [categoria_id]
            );
            
            if (categoria.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    success: false,
                    message: 'Categoría de gasto no encontrada o inactiva'
                });
            }
            categoriaNombre = categoria[0].nombre;
        }
        
        if (necesitaAjusteFondos) {
            await CuentasSistema.acreditarCuenta(
                connection,
                cuentaIdAnterior,
                montoAnterior,
                `Ajuste Gasto #${id} - Reversión`,
                id
            );
            
            await CuentasSistema.debitarCuenta(
                connection,
                cuentaIdFinal,
                montoFinal,
                `Ajuste Gasto #${id} - ${categoriaNombre}`,
                id
            );
        }
        
        const camposActualizar = [];
        const valoresActualizar = [];
        
        if (categoria_id !== undefined) {
            camposActualizar.push('categoria_id = ?');
            valoresActualizar.push(categoria_id);
            camposActualizar.push('categoria_nombre = ?');
            valoresActualizar.push(categoriaNombre);
        }
        if (descripcion !== undefined) {
            camposActualizar.push('descripcion = ?');
            // Columna NOT NULL: vacío / null se guarda como ''
            valoresActualizar.push(typeof descripcion === 'string' ? descripcion.trim() : '');
        }
        if (monto !== undefined) {
            camposActualizar.push('monto = ?');
            valoresActualizar.push(monto);
        }
        if (forma_pago !== undefined) {
            camposActualizar.push('forma_pago = ?');
            valoresActualizar.push(forma_pago);
        }
        if (observaciones !== undefined) {
            camposActualizar.push('observaciones = ?');
            valoresActualizar.push(observaciones || null);
        }
        if (fecha !== undefined) {
            camposActualizar.push('fecha = ?');
            valoresActualizar.push(fecha);
        }
        if (cuentaIdAnterior !== cuentaIdFinal) {
            camposActualizar.push('cuenta_id = ?');
            valoresActualizar.push(cuentaIdFinal);
        }
        
        if (camposActualizar.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }
        
        const queryUpdate = `UPDATE gastos SET ${camposActualizar.join(', ')} WHERE id = ?`;
        valoresActualizar.push(id);
        
        await connection.execute(queryUpdate, valoresActualizar);
        
        await connection.commit();
        
        await auditarOperacion(req, {
            accion: 'UPDATE_GASTO',
            tabla: 'gastos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Gasto actualizado: ID ${id}`
        });
        
        console.log(`✅ Gasto actualizado: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Gasto actualizado exitosamente',
            data: { id: parseInt(id) }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al editar gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Eliminar un gasto
 * DELETE /gastos/:id
 */
const eliminarGasto = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.validatedParams || req.params;
        
        console.log(`🗑️ Eliminando gasto ID: ${id}`);
        
        // Obtener datos del gasto
        const [gasto] = await connection.execute(
            'SELECT * FROM gastos WHERE id = ?',
            [id]
        );
        
        if (gasto.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'Gasto no encontrado'
            });
        }
        
        const datosGasto = gasto[0];
        
        if (!datosGasto.cuenta_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'El gasto no tiene cuenta asociada. No se puede eliminar correctamente.'
            });
        }
        
        const montoGasto = parseFloat(datosGasto.monto);
        
        await CuentasSistema.acreditarCuenta(
            connection,
            datosGasto.cuenta_id,
            montoGasto,
            `Eliminación Gasto #${id}`,
            id
        );
        
        await connection.execute('DELETE FROM gastos WHERE id = ?', [id]);
        
        await connection.commit();
        
        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_GASTO',
            tabla: 'gastos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosGasto),
            detallesAdicionales: `Gasto eliminado: ${datosGasto.descripcion} - $${datosGasto.monto}`
        });
        
        console.log(`✅ Gasto eliminado: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Gasto eliminado exitosamente',
            data: { id: parseInt(id), descripcion: datosGasto.descripcion }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al eliminar gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

// =====================================================
// GESTIÓN DE CATEGORÍAS DE GASTOS
// =====================================================

/**
 * Obtener todas las categorías de gastos
 * GET /gastos/categorias
 */
const obtenerCategoriasGastos = async (req, res) => {
    try {
        const { activa } = req.query;
        
        let query = `
            SELECT 
                cg.id, cg.nombre, cg.descripcion, cg.activa,
                COUNT(g.id) as total_gastos,
                COALESCE(SUM(g.monto), 0) as monto_total
            FROM categoria_gastos cg
            LEFT JOIN gastos g ON cg.id = g.categoria_id
        `;
        
        const params = [];
        
        if (activa !== undefined) {
            query += ' WHERE cg.activa = ?';
            params.push(activa === 'true' || activa === '1' ? 1 : 0);
        }
        
        query += ' GROUP BY cg.id, cg.nombre, cg.descripcion, cg.activa ORDER BY cg.nombre';
        
        const [categorias] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: categorias
        });
        
    } catch (error) {
        console.error('❌ Error al obtener categorías de gastos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener categorías de gastos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Crear una nueva categoría de gasto
 * POST /gastos/categorias
 */
const crearCategoriaGasto = async (req, res) => {
    try {
        console.log('📁 Creando categoría de gasto...');
        
        const { nombre, descripcion } = req.validatedData || req.body;
        
        // Validaciones
        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'El nombre de la categoría es obligatorio'
            });
        }
        
        // Verificar nombre único
        const [nombreExistente] = await db.execute(
            'SELECT id FROM categoria_gastos WHERE nombre = ?',
            [nombre.trim()]
        );
        
        if (nombreExistente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una categoría con ese nombre'
            });
        }
        
        // Insertar categoría
        const query = `
            INSERT INTO categoria_gastos (nombre, descripcion, activa)
            VALUES (?, ?, 1)
        `;
        
        const [result] = await db.execute(query, [
            nombre.trim(),
            descripcion?.trim() || null
        ]);
        
        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_CATEGORIA_GASTO',
            tabla: 'categoria_gastos',
            registroId: result.insertId,
            datosNuevos: limpiarDatosSensibles({ nombre, descripcion }),
            detallesAdicionales: `Categoría de gasto creada: ${nombre}`
        });
        
        console.log(`✅ Categoría de gasto creada: ${nombre} - ID: ${result.insertId}`);
        
        res.status(201).json({
            success: true,
            message: 'Categoría de gasto creada exitosamente',
            data: {
                id: result.insertId,
                nombre: nombre.trim(),
                descripcion: descripcion?.trim() || null,
                activa: 1
            }
        });
        
    } catch (error) {
        console.error('❌ Error al crear categoría de gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear categoría de gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar una categoría de gasto
 * PUT /gastos/categorias/:id
 */
const editarCategoriaGasto = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        const { nombre, descripcion, activa } = req.validatedData || req.body;
        
        console.log(`✏️ Editando categoría de gasto ID: ${id}`);
        
        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('categoria_gastos', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }
        
        // Verificar nombre único si se está cambiando
        if (nombre && nombre !== datosAnteriores.nombre) {
            const [nombreExistente] = await db.execute(
                'SELECT id FROM categoria_gastos WHERE nombre = ? AND id != ?',
                [nombre.trim(), id]
            );
            
            if (nombreExistente.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe otra categoría con ese nombre'
                });
            }
        }
        
        // Construir query de actualización
        const camposActualizar = [];
        const valoresActualizar = [];
        
        if (nombre !== undefined) {
            camposActualizar.push('nombre = ?');
            valoresActualizar.push(nombre.trim());
        }
        if (descripcion !== undefined) {
            camposActualizar.push('descripcion = ?');
            valoresActualizar.push(descripcion?.trim() || null);
        }
        if (activa !== undefined) {
            camposActualizar.push('activa = ?');
            valoresActualizar.push(activa ? 1 : 0);
        }
        
        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }
        
        // Actualizar categoría
        const query = `UPDATE categoria_gastos SET ${camposActualizar.join(', ')} WHERE id = ?`;
        valoresActualizar.push(id);
        
        await db.execute(query, valoresActualizar);
        
        // Si se cambió el nombre, actualizar en gastos existentes
        if (nombre && nombre !== datosAnteriores.nombre) {
            await db.execute(
                'UPDATE gastos SET categoria_nombre = ? WHERE categoria_id = ?',
                [nombre.trim(), id]
            );
        }
        
        // Auditar cambios
        await auditarOperacion(req, {
            accion: 'UPDATE_CATEGORIA_GASTO',
            tabla: 'categoria_gastos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Categoría de gasto actualizada: ${nombre || datosAnteriores.nombre}`
        });
        
        console.log(`✅ Categoría de gasto actualizada: ID ${id}`);
        
        res.json({
            success: true,
            message: 'Categoría actualizada exitosamente',
            data: { id: parseInt(id) }
        });
        
    } catch (error) {
        console.error('❌ Error al editar categoría de gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar categoría de gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Eliminar/Desactivar una categoría de gasto
 * DELETE /gastos/categorias/:id
 */
const eliminarCategoriaGasto = async (req, res) => {
    try {
        const { id } = req.validatedParams || req.params;
        
        console.log(`🗑️ Eliminando/Desactivando categoría de gasto ID: ${id}`);
        
        // Obtener datos de la categoría
        const datosAnteriores = await obtenerDatosAnteriores('categoria_gastos', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }
        
        // Verificar si tiene gastos asociados
        const [gastosAsociados] = await db.execute(
            'SELECT COUNT(*) as count FROM gastos WHERE categoria_id = ?',
            [id]
        );
        
        if (gastosAsociados[0].count > 0) {
            // Si tiene gastos, hacer soft delete (desactivar)
            await db.execute(
                'UPDATE categoria_gastos SET activa = 0 WHERE id = ?',
                [id]
            );
            
            await auditarOperacion(req, {
                accion: 'SOFT_DELETE_CATEGORIA_GASTO',
                tabla: 'categoria_gastos',
                registroId: id,
                datosAnteriores: limpiarDatosSensibles(datosAnteriores),
                detallesAdicionales: `Categoría de gasto desactivada (tiene ${gastosAsociados[0].count} gastos asociados): ${datosAnteriores.nombre}`
            });
            
            console.log(`✅ Categoría de gasto desactivada: ${datosAnteriores.nombre} - ID: ${id}`);
            
            return res.json({
                success: true,
                message: `Categoría desactivada (tiene ${gastosAsociados[0].count} gastos asociados)`,
                data: { id: parseInt(id), nombre: datosAnteriores.nombre, desactivada: true }
            });
        }
        
        // Si no tiene gastos, eliminar físicamente
        await db.execute('DELETE FROM categoria_gastos WHERE id = ?', [id]);
        
        await auditarOperacion(req, {
            accion: 'DELETE_CATEGORIA_GASTO',
            tabla: 'categoria_gastos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Categoría de gasto eliminada: ${datosAnteriores.nombre}`
        });
        
        console.log(`✅ Categoría de gasto eliminada: ${datosAnteriores.nombre} - ID: ${id}`);
        
        res.json({
            success: true,
            message: 'Categoría eliminada exitosamente',
            data: { id: parseInt(id), nombre: datosAnteriores.nombre }
        });
        
    } catch (error) {
        console.error('❌ Error al eliminar categoría de gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar categoría de gasto',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Obtener resumen de gastos por período
 * GET /gastos/resumen
 */
const obtenerResumenGastos = async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;
        
        let whereClause = '1=1';
        const params = [];
        
        if (fecha_desde) {
            whereClause += ' AND DATE(g.fecha) >= ?';
            params.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            whereClause += ' AND DATE(g.fecha) <= ?';
            params.push(fecha_hasta);
        }
        
        // Resumen por categoría
        const queryPorCategoria = `
            SELECT 
                g.categoria_id,
                g.categoria_nombre,
                COUNT(*) as cantidad_gastos,
                SUM(g.monto) as monto_total
            FROM gastos g
            WHERE ${whereClause}
            GROUP BY g.categoria_id, g.categoria_nombre
            ORDER BY monto_total DESC
        `;
        
        const [porCategoria] = await db.execute(queryPorCategoria, params);
        
        // Totales generales
        const queryTotales = `
            SELECT 
                COUNT(*) as total_gastos,
                COALESCE(SUM(monto), 0) as monto_total,
                COALESCE(AVG(monto), 0) as monto_promedio,
                COALESCE(MIN(monto), 0) as monto_minimo,
                COALESCE(MAX(monto), 0) as monto_maximo
            FROM gastos g
            WHERE ${whereClause}
        `;
        
        const [totales] = await db.execute(queryTotales, params);
        
        res.json({
            success: true,
            data: {
                totales: totales[0],
                por_categoria: porCategoria
            }
        });
        
    } catch (error) {
        console.error('❌ Error al obtener resumen de gastos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener resumen de gastos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    // Gastos
    crearGasto,
    obtenerGastos,
    obtenerGastoPorId,
    editarGasto,
    eliminarGasto,
    
    // Categorías de Gastos
    obtenerCategoriasGastos,
    crearCategoriaGasto,
    editarCategoriaGasto,
    eliminarCategoriaGasto,
    
    // Auxiliares
    obtenerResumenGastos
};

