// controllers/inventarioController.js - Sistema Chalito
const db = require('./dbPromise');
const { auditarOperacion, obtenerDatosAnteriores, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

// =====================================================
// GESTIÓN DE ARTÍCULOS
// =====================================================

/**
 * Crear un nuevo artículo
 */
const crearArticulo = async (req, res) => {
    try {
        console.log('📦 Creando nuevo artículo...');
        
        const {
            categoria_id,
            codigo_barra,
            nombre,
            descripcion,
            precio,
            stock_actual = 0,
            stock_minimo = 0,
            tipo = 'OTRO',
            imagen_url,
            ingredientes = [] // Para artículos elaborados
        } = req.body;

        // Validaciones básicas
        if (!categoria_id || !nombre || !precio) {
            return res.status(400).json({
                success: false,
                message: 'Categoría, nombre y precio son obligatorios'
            });
        }

        if (precio < 0 || stock_actual < 0 || stock_minimo < 0) {
            return res.status(400).json({
                success: false,
                message: 'Los valores numéricos no pueden ser negativos'
            });
        }

        // Verificar que la categoría existe
        const [categoria] = await db.execute(
            'SELECT id FROM categorias WHERE id = ?', 
            [categoria_id]
        );

        if (categoria.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }

        // Verificar que el nombre no esté duplicado
        const [nombreExistente] = await db.execute(
            'SELECT id FROM articulos WHERE nombre = ? AND activo = "1"', 
            [nombre]
        );

        if (nombreExistente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe un artículo con ese nombre'
            });
        }

        // Verificar código de barras si se proporciona
        if (codigo_barra) {
            const [codigoExistente] = await db.execute(
                'SELECT id FROM articulos WHERE codigo_barra = ?', 
                [codigo_barra]
            );

            if (codigoExistente.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe un artículo con ese código de barras'
                });
            }
        }

        // Iniciar transacción para consistencia
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Insertar artículo
            const queryArticulo = `
                INSERT INTO articulos (
                    categoria_id, codigo_barra, nombre, descripcion, precio, 
                    stock_actual, stock_minimo, tipo, imagen_url, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;

            const [resultArticulo] = await connection.execute(queryArticulo, [
                categoria_id, codigo_barra || null, nombre, descripcion || null, precio,
                stock_actual, stock_minimo, tipo, imagen_url || null
            ]);

            const articuloId = resultArticulo.insertId;

            // Si es elaborado y tiene ingredientes, agregar contenido
            if (tipo === 'ELABORADO' && ingredientes.length > 0) {
                for (const ingrediente of ingredientes) {
                    // Validar ingrediente
                    const [ingExiste] = await connection.execute(
                        'SELECT id FROM ingredientes WHERE id = ? AND disponible = 1',
                        [ingrediente.ingrediente_id]
                    );

                    if (ingExiste.length === 0) {
                        throw new Error(`Ingrediente ID ${ingrediente.ingrediente_id} no encontrado o no disponible`);
                    }

                    // Insertar en articulo_contenido
                    await connection.execute(`
                        INSERT INTO articulo_contenido (
                            articulo_id, ingrediente_id, unidad_medida, cantidad
                        ) VALUES (?, ?, ?, ?)
                    `, [
                        articuloId,
                        ingrediente.ingrediente_id,
                        ingrediente.unidad_medida || 'UNIDADES',
                        ingrediente.cantidad
                    ]);
                }
            }

            await connection.commit();
            connection.release();

            // Auditar creación
            await auditarOperacion(req, {
                accion: 'CREATE_ARTICULO',
                tabla: 'articulos',
                registroId: articuloId,
                datosNuevos: limpiarDatosSensibles({
                    categoria_id, nombre, precio, tipo,
                    ingredientes: tipo === 'ELABORADO' ? ingredientes.length : 0
                }),
                detallesAdicionales: `Artículo creado: ${nombre} (${tipo})`
            });

            console.log(`✅ Artículo creado: ${nombre} - ID: ${articuloId}`);

            res.status(201).json({
                success: true,
                message: 'Artículo creado exitosamente',
                data: {
                    id: articuloId,
                    nombre,
                    tipo,
                    precio,
                    ingredientes_agregados: tipo === 'ELABORADO' ? ingredientes.length : 0
                }
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Error creando artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener artículo por ID con contenido si es elaborado
 */
const obtenerArticulo = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de artículo inválido'
            });
        }

        // Obtener artículo con información de categoría
        const queryArticulo = `
            SELECT 
                a.id, a.codigo_barra, a.nombre, a.descripcion, a.precio,
                a.stock_actual, a.stock_minimo, a.tipo, a.imagen_url, 
                a.activo, a.fecha_creacion, a.fecha_modificacion,
                c.id as categoria_id, c.nombre as categoria_nombre
            FROM articulos a
            INNER JOIN categorias c ON a.categoria_id = c.id
            WHERE a.id = ?
        `;

        const [articulos] = await db.execute(queryArticulo, [id]);

        if (articulos.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Artículo no encontrado'
            });
        }

        const articulo = articulos[0];
        let contenido = [];

        // Si es elaborado, obtener contenido
        if (articulo.tipo === 'ELABORADO') {
            const queryContenido = `
                SELECT 
                    ac.id, ac.unidad_medida, ac.cantidad,
                    i.id as ingrediente_id, i.nombre as ingrediente_nombre,
                    i.descripcion as ingrediente_descripcion, i.precio_extra
                FROM articulo_contenido ac
                INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
                WHERE ac.articulo_id = ?
                ORDER BY i.nombre
            `;

            const [contenidoResult] = await db.execute(queryContenido, [id]);
            contenido = contenidoResult;
        }

        console.log(`✅ Artículo obtenido: ${articulo.nombre}`);

        res.json({
            success: true,
            data: {
                ...articulo,
                contenido: contenido,
                total_ingredientes: contenido.length
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Listar y filtrar artículos con paginación
 */
const filtrarArticulos = async (req, res) => {
    try {
        console.log('🔍 Filtrando artículos...');
        
        const {
            nombre,
            categoria_id,
            tipo,
            stock_bajo = false,
            activo = 1,
            limite = 10,
            pagina = 1
        } = req.query;

        let whereConditions = ['1=1'];
        let queryParams = [];

        // Filtro por nombre
        if (nombre && nombre.trim() !== '') {
            whereConditions.push('a.nombre LIKE ?');
            queryParams.push(`%${nombre.trim()}%`);
        }

        // Filtro por categoría
        if (categoria_id && categoria_id !== '') {
            whereConditions.push('a.categoria_id = ?');
            queryParams.push(parseInt(categoria_id));
        }

        // Filtro por tipo
        if (tipo && tipo !== '') {
            whereConditions.push('a.tipo = ?');
            queryParams.push(tipo);
        }

        // Filtro por stock bajo
        if (stock_bajo === 'true') {
            whereConditions.push('a.stock_actual <= a.stock_minimo');
        }

        // Filtro por estado activo
        if (activo !== 'all') {
            whereConditions.push('a.activo = ?');
            queryParams.push(activo === 'true' ? 1 : 0);
        }

        const whereClause = whereConditions.join(' AND ');

        // Query principal
        let query = `
            SELECT 
                a.id, a.codigo_barra, a.nombre, a.descripcion, a.precio,
                a.stock_actual, a.stock_minimo, a.tipo, a.activo,
                a.fecha_creacion, a.fecha_modificacion,
                c.id as categoria_id, c.nombre as categoria_nombre,
                CASE 
                    WHEN a.stock_actual <= a.stock_minimo THEN 1 
                    ELSE 0 
                END as stock_bajo
            FROM articulos a
            INNER JOIN categorias c ON a.categoria_id = c.id
            WHERE ${whereClause}
            ORDER BY a.nombre ASC
        `;

        // Paginación -- Cambie limite por 10 y maximo de 30
        const limiteNum = Math.min(parseInt(limite) || 10, 30);
        const paginaNum = Math.max(parseInt(pagina) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;

        query += ` LIMIT ${limiteNum} OFFSET ${offset}`;

        const [resultados] = await db.execute(query, queryParams);

        // Query de conteo
        const queryCount = `
            SELECT COUNT(*) as total 
            FROM articulos a
            INNER JOIN categorias c ON a.categoria_id = c.id
            WHERE ${whereClause}
        `;

        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;

        console.log(`✅ Artículos encontrados: ${resultados.length}, Total: ${total}`);

        res.json({
            success: true,
            data: resultados,
            meta: {
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum,
                hay_mas: (paginaNum * limiteNum) < total
            }
        });

    } catch (error) {
        console.error('❌ Error filtrando artículos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al filtrar artículos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar artículo existente
 */
const editarArticulo = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            categoria_id,
            codigo_barra,
            nombre,
            descripcion,
            precio,
            stock_actual,
            stock_minimo,
            tipo,
            imagen_url,
            activo
        } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de artículo inválido'
            });
        }

        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('articulos', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Artículo no encontrado'
            });
        }

        // Validaciones
        if (precio !== undefined && precio < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio no puede ser negativo'
            });
        }

        if (stock_actual !== undefined && stock_actual < 0) {
            return res.status(400).json({
                success: false,
                message: 'El stock actual no puede ser negativo'
            });
        }

        // Verificar cambio de tipo si tiene contenido
        if (tipo && tipo !== datosAnteriores.tipo && datosAnteriores.tipo === 'ELABORADO') {
            const [tieneContenido] = await db.execute(
                'SELECT COUNT(*) as count FROM articulo_contenido WHERE articulo_id = ?',
                [id]
            );

            if (tieneContenido[0].count > 0 && tipo !== 'ELABORADO') {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede cambiar el tipo de un artículo elaborado que tiene ingredientes asignados'
                });
            }
        }

        // Verificar nombre único si se está cambiando
        if (nombre && nombre !== datosAnteriores.nombre) {
            const [nombreExistente] = await db.execute(
                'SELECT id FROM articulos WHERE nombre = ? AND id != ? AND activo = "1"',
                [nombre, id]
            );

            if (nombreExistente.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe otro artículo con ese nombre'
                });
            }
        }

        // Construir query de actualización dinámicamente
        const camposActualizar = [];
        const valoresActualizar = [];

        if (categoria_id !== undefined) {
            camposActualizar.push('categoria_id = ?');
            valoresActualizar.push(categoria_id);
        }
        if (codigo_barra !== undefined) {
            camposActualizar.push('codigo_barra = ?');
            valoresActualizar.push(codigo_barra || null);
        }
        if (nombre !== undefined) {
            camposActualizar.push('nombre = ?');
            valoresActualizar.push(nombre);
        }
        if (descripcion !== undefined) {
            camposActualizar.push('descripcion = ?');
            valoresActualizar.push(descripcion || null);
        }
        if (precio !== undefined) {
            camposActualizar.push('precio = ?');
            valoresActualizar.push(precio);
        }
        if (stock_actual !== undefined) {
            camposActualizar.push('stock_actual = ?');
            valoresActualizar.push(stock_actual);
        }
        if (stock_minimo !== undefined) {
            camposActualizar.push('stock_minimo = ?');
            valoresActualizar.push(stock_minimo);
        }
        if (tipo !== undefined) {
            camposActualizar.push('tipo = ?');
            valoresActualizar.push(tipo);
        }
        if (imagen_url !== undefined) {
            camposActualizar.push('imagen_url = ?');
            valoresActualizar.push(imagen_url || null);
        }
        if (activo !== undefined) {
            camposActualizar.push('activo = ?');
            valoresActualizar.push(activo ? 1 : 0);
        }

        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }

        // Actualizar ingrediente
        const query = `UPDATE ingredientes SET ${camposActualizar.join(', ')} WHERE id = ?`;
        valoresActualizar.push(id);

        await db.execute(query, valoresActualizar);

        // Auditar cambios
        await auditarOperacion(req, {
            accion: 'UPDATE_INGREDIENTE',
            tabla: 'ingredientes',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Ingrediente actualizado: ${nombre || datosAnteriores.nombre}`
        });

        console.log(`✅ Ingrediente actualizado: ID ${id}`);

        res.json({
            success: true,
            message: 'Ingrediente actualizado exitosamente',
            data: { id: parseInt(id) }
        });

    } catch (error) {
        console.error('❌ Error editando ingrediente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar ingrediente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Eliminar articulo (soft delete)
 */

const eliminarArticulo = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de artículo inválido'
            });
        }

        // Obtener datos anteriores para auditoría
        const datosAnteriores = await obtenerDatosAnteriores('articulos', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Artículo no encontrado'
            });
        }

        // Verificar si ya está eliminado
        if (datosAnteriores.activo === 0) {
            return res.status(400).json({
                success: false,
                message: 'El artículo ya está eliminado'
            });
        }

        // Verificar si el artículo está siendo usado en pedidos activos
        const [pedidosActivos] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM pedidos_contenido pd
            INNER JOIN pedidos p ON pd.pedido_id = p.id
            WHERE pd.articulo_id = ? 
            AND p.estado IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO')
        `, [id]);

        if (pedidosActivos[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar el artículo porque está en pedidos activos',
                code: 'ARTICULO_EN_USO'
            });
        }

        // Soft delete: marcar como inactivo
        await db.execute(
            'UPDATE articulos SET activo = "0" WHERE id = ?',
            [id]
        );

        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_ARTICULO',
            tabla: 'articulos',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Artículo eliminado (soft delete): ${datosAnteriores.nombre}`
        });

        console.log(`✅ Artículo eliminado (soft delete): ${datosAnteriores.nombre} - ID: ${id}`);

        res.json({
            success: true,
            message: 'Artículo eliminado exitosamente',
            data: {
                id: parseInt(id),
                nombre: datosAnteriores.nombre
            }
        });

    } catch (error) {
        console.error('❌ Error eliminando artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// =====================================================
// GESTIÓN DE INGREDIENTES
// =====================================================

/**
 * Crear un nuevo ingrediente
 */
const crearIngrediente = async (req, res) => {
    try {
        console.log('🧂 Creando nuevo ingrediente...');
        
        const {
            nombre,
            descripcion,
            precio_extra = 0,
            disponible = 1
        } = req.body;

        // Validaciones básicas
        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'El nombre del ingrediente es obligatorio'
            });
        }

        if (precio_extra < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio extra no puede ser negativo'
            });
        }

        // Verificar que el nombre no esté duplicado
        const [nombreExistente] = await db.execute(
            'SELECT id FROM ingredientes WHERE nombre = ?',
            [nombre.trim()]
        );

        if (nombreExistente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe un ingrediente con ese nombre'
            });
        }

        // Insertar ingrediente
        const query = `
            INSERT INTO ingredientes (nombre, descripcion, precio_extra, disponible)
            VALUES (?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [
            nombre.trim(),
            descripcion?.trim() || null,
            precio_extra,
            disponible ? 1 : 0
        ]);

        const ingredienteId = result.insertId;

        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_INGREDIENTE',
            tabla: 'ingredientes',
            registroId: ingredienteId,
            datosNuevos: limpiarDatosSensibles({
                nombre: nombre.trim(),
                precio_extra,
                disponible
            }),
            detallesAdicionales: `Ingrediente creado: ${nombre.trim()}`
        });

        console.log(`✅ Ingrediente creado: ${nombre} - ID: ${ingredienteId}`);

        res.status(201).json({
            success: true,
            message: 'Ingrediente creado exitosamente',
            data: {
                id: ingredienteId,
                nombre: nombre.trim(),
                precio_extra,
                disponible: disponible ? 1 : 0
            }
        });

    } catch (error) {
        console.error('❌ Error creando ingrediente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear ingrediente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener ingrediente por ID
 */
const obtenerIngrediente = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de ingrediente inválido'
            });
        }

        // Obtener ingrediente
        const query = `
            SELECT 
                id, nombre, descripcion, precio_extra, disponible, fecha_creacion
            FROM ingredientes
            WHERE id = ?
        `;

        const [ingredientes] = await db.execute(query, [id]);

        if (ingredientes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ingrediente no encontrado'
            });
        }

        const ingrediente = ingredientes[0];

        // Opcional: Contar en cuántos artículos se usa
        const [articulosUsando] = await db.execute(
            'SELECT COUNT(*) as total FROM articulo_contenido WHERE ingrediente_id = ?',
            [id]
        );

        console.log(`✅ Ingrediente obtenido: ${ingrediente.nombre}`);

        res.json({
            success: true,
            data: {
                ...ingrediente,
                usado_en_articulos: articulosUsando[0].total
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo ingrediente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ingrediente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Listar y filtrar ingredientes con paginación
 */
const filtrarIngredientes = async (req, res) => {
    try {
        console.log('🔍 Filtrando ingredientes...');
        
        const {
            nombre,
            disponible = 1,
            limite = 10,
            pagina = 1
        } = req.query;

        let whereConditions = ['1=1'];
        let queryParams = [];

        // Filtro por nombre
        if (nombre && nombre.trim() !== '') {
            whereConditions.push('nombre LIKE ?');
            queryParams.push(`%${nombre.trim()}%`);
        }

        // Filtro por disponibilidad
        if (disponible !== 'all') {
            whereConditions.push('disponible = ?');
            queryParams.push(disponible === 'true' ? 1 : 0);
        }

        const whereClause = whereConditions.join(' AND ');

        // Query principal
        let query = `
            SELECT 
                id, nombre, descripcion, precio_extra, disponible, fecha_creacion
            FROM ingredientes
            WHERE ${whereClause}
            ORDER BY nombre ASC
        `;

        // Paginación -- Cambie limite por 10 y maximo de 30
        const limiteNum = Math.min(parseInt(limite) || 10, 30);
        const paginaNum = Math.max(parseInt(pagina) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;

        query += ` LIMIT ${limiteNum} OFFSET ${offset}`;

        const [resultados] = await db.execute(query, queryParams);

        // Query de conteo
        const queryCount = `
            SELECT COUNT(*) as total 
            FROM ingredientes
            WHERE ${whereClause}
        `;

        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;

        console.log(`✅ Ingredientes encontrados: ${resultados.length}, Total: ${total}`);

        res.json({
            success: true,
            data: resultados,
            meta: {
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum,
                hay_mas: (paginaNum * limiteNum) < total
            }
        });

    } catch (error) {
        console.error('❌ Error filtrando ingredientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al filtrar ingredientes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar ingrediente existente
 */
const editarIngrediente = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            descripcion,
            precio_extra,
            disponible
        } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de ingrediente inválido'
            });
        }

        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('ingredientes', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Ingrediente no encontrado'
            });
        }

        // Validaciones
        if (precio_extra !== undefined && precio_extra < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio extra no puede ser negativo'
            });
        }

        // Verificar nombre único si se está cambiando
        if (nombre && nombre.trim() !== '' && nombre.trim() !== datosAnteriores.nombre) {
            const [nombreExistente] = await db.execute(
                'SELECT id FROM ingredientes WHERE nombre = ? AND id != ?',
                [nombre.trim(), id]
            );

            if (nombreExistente.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe otro ingrediente con ese nombre'
                });
            }
        }

        // Construir query de actualización dinámicamente
        const camposActualizar = [];
        const valoresActualizar = [];

        if (nombre !== undefined && nombre.trim() !== '') {
            camposActualizar.push('nombre = ?');
            valoresActualizar.push(nombre.trim());
        }
        if (descripcion !== undefined) {
            camposActualizar.push('descripcion = ?');
            valoresActualizar.push(descripcion?.trim() || null);
        }
        if (precio_extra !== undefined) {
            camposActualizar.push('precio_extra = ?');
            valoresActualizar.push(precio_extra);
        }
        if (disponible !== undefined) {
            camposActualizar.push('disponible = ?');
            valoresActualizar.push(disponible ? 1 : 0);
        }

        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }

        // Actualizar ingrediente
        const query = `UPDATE ingredientes SET ${camposActualizar.join(', ')} WHERE id = ?`;
        valoresActualizar.push(id);

        await db.execute(query, valoresActualizar);

        // Auditar cambios
        await auditarOperacion(req, {
            accion: 'UPDATE_INGREDIENTE',
            tabla: 'ingredientes',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Ingrediente actualizado: ${nombre || datosAnteriores.nombre}`
        });

        console.log(`✅ Ingrediente actualizado: ID ${id}`);

        res.json({
            success: true,
            message: 'Ingrediente actualizado exitosamente',
            data: { id: parseInt(id) }
        });

    } catch (error) {
        console.error('❌ Error editando ingrediente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar ingrediente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Eliminar ingrediente
 */
const eliminarIngrediente = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de ingrediente inválido'
            });
        }

        // Obtener datos del ingrediente
        const datosAnteriores = await obtenerDatosAnteriores('ingredientes', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Ingrediente no encontrado'
            });
        }

        // Verificar si está siendo usado en artículos elaborados
        const [enUso] = await db.execute(
            'SELECT COUNT(*) as count FROM articulo_contenido WHERE ingrediente_id = ?',
            [id]
        );

        if (enUso[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar el ingrediente porque está siendo usado en artículos elaborados'
            });
        }

        // Eliminar ingrediente (soft delete)
        await db.execute('UPDATE ingredientes SET disponible = 0 WHERE id = ?', [id]);

        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_INGREDIENTE',
            tabla: 'ingredientes',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Ingrediente eliminado: ${datosAnteriores.nombre}`
        });

        console.log(`✅ Ingrediente eliminado: ${datosAnteriores.nombre} - ID: ${id}`);

        res.json({
            success: true,
            message: 'Ingrediente eliminado exitosamente',
            data: { id: parseInt(id), nombre: datosAnteriores.nombre }
        });

    } catch (error) {
        console.error('❌ Error eliminando ingrediente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar ingrediente',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// =====================================================
// GESTIÓN DE CONTENIDO DE ARTÍCULOS ELABORADOS
// =====================================================

/**
 * Obtener contenido de un artículo elaborado
 */
const obtenerContenidoArticulo = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de artículo inválido'
            });
        }

        // Verificar que el artículo existe y es elaborado
        const [articulo] = await db.execute(
            'SELECT id, nombre, tipo FROM articulos WHERE id = ? AND activo = "1"',
            [id]
        );

        if (articulo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Artículo no encontrado'
            });
        }

        if (articulo[0].tipo !== 'ELABORADO') {
            return res.status(400).json({
                success: false,
                message: 'Solo los artículos elaborados pueden tener contenido'
            });
        }

        // Obtener contenido con información de ingredientes
        const queryContenido = `
            SELECT 
                ac.id, ac.unidad_medida, ac.cantidad,
                i.id as ingrediente_id, i.nombre as ingrediente_nombre,
                i.descripcion as ingrediente_descripcion, i.precio_extra,
                i.disponible
            FROM articulo_contenido ac
            INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
            WHERE ac.articulo_id = ?
            ORDER BY i.nombre
        `;

        const [contenido] = await db.execute(queryContenido, [id]);

        // Calcular costo total de ingredientes
        const costoTotal = contenido.reduce((sum, item) => sum + parseFloat(item.precio_extra), 0);

        console.log(`✅ Contenido obtenido para artículo: ${articulo[0].nombre}`);

        res.json({
            success: true,
            data: {
                articulo: articulo[0],
                contenido: contenido,
                total_ingredientes: contenido.length,
                costo_total_ingredientes: costoTotal
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo contenido de artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener contenido de artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Agregar ingrediente a artículo elaborado
 */
const agregarIngredienteAArticulo = async (req, res) => {
    try {
        const { id } = req.params; // ID del artículo
        const { ingrediente_id, unidad_medida = 'UNIDADES', cantidad } = req.body;

        console.log(`🧄 Agregando ingrediente a artículo ID: ${id}`);

        // Validaciones básicas
        if (!ingrediente_id || !cantidad) {
            return res.status(400).json({
                success: false,
                message: 'ID de ingrediente y cantidad son obligatorios'
            });
        }

        if (cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a cero'
            });
        }

        // Verificar que el artículo existe y es elaborado
        const [articulo] = await db.execute(
            'SELECT id, nombre, tipo FROM articulos WHERE id = ? AND activo = "1"',
            [id]
        );

        if (articulo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Artículo no encontrado'
            });
        }

        if (articulo[0].tipo !== 'ELABORADO') {
            return res.status(400).json({
                success: false,
                message: 'Solo se puede agregar ingredientes a artículos elaborados'
            });
        }

        // Verificar que el ingrediente existe y está disponible
        const [ingrediente] = await db.execute(
            'SELECT id, nombre, disponible FROM ingredientes WHERE id = ?',
            [ingrediente_id]
        );

        if (ingrediente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ingrediente no encontrado'
            });
        }

        if (!ingrediente[0].disponible) {
            return res.status(400).json({
                success: false,
                message: 'El ingrediente no está disponible'
            });
        }

        // Verificar que no esté ya agregado
        const [yaExiste] = await db.execute(
            'SELECT id FROM articulo_contenido WHERE articulo_id = ? AND ingrediente_id = ?',
            [id, ingrediente_id]
        );

        if (yaExiste.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Este ingrediente ya está agregado al artículo'
            });
        }

        // Insertar en articulo_contenido
        const query = `
            INSERT INTO articulo_contenido (articulo_id, ingrediente_id, unidad_medida, cantidad)
            VALUES (?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [id, ingrediente_id, unidad_medida, cantidad]);

        // Auditar operación
        await auditarOperacion(req, {
            accion: 'ADD_INGREDIENTE_ARTICULO',
            tabla: 'articulo_contenido',
            registroId: result.insertId,
            datosNuevos: { articulo_id: id, ingrediente_id, unidad_medida, cantidad },
            detallesAdicionales: `Ingrediente "${ingrediente[0].nombre}" agregado a artículo "${articulo[0].nombre}"`
        });

        console.log(`✅ Ingrediente agregado: ${ingrediente[0].nombre} a ${articulo[0].nombre}`);

        res.status(201).json({
            success: true,
            message: 'Ingrediente agregado al artículo exitosamente',
            data: {
                id: result.insertId,
                articulo_nombre: articulo[0].nombre,
                ingrediente_nombre: ingrediente[0].nombre,
                unidad_medida,
                cantidad
            }
        });

    } catch (error) {
        console.error('❌ Error agregando ingrediente a artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al agregar ingrediente al artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar ingrediente en artículo elaborado
 */
const editarContenidoArticulo = async (req, res) => {
    try {
        const { id, ingrediente_id } = req.params;
        const { unidad_medida, cantidad } = req.body;

        console.log(`✏️ Editando contenido - Artículo: ${id}, Ingrediente: ${ingrediente_id}`);

        // Validaciones
        if (cantidad !== undefined && cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a cero'
            });
        }

        // Verificar que existe la relación
        const [contenidoExiste] = await db.execute(`
            SELECT ac.id, ac.unidad_medida, ac.cantidad,
                   a.nombre as articulo_nombre, i.nombre as ingrediente_nombre
            FROM articulo_contenido ac
            INNER JOIN articulos a ON ac.articulo_id = a.id
            INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
            WHERE ac.articulo_id = ? AND ac.ingrediente_id = ?
        `, [id, ingrediente_id]);

        if (contenidoExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Relación artículo-ingrediente no encontrada'
            });
        }

        const datosAnteriores = contenidoExiste[0];

        // Construir query de actualización
        const camposActualizar = [];
        const valoresActualizar = [];

        if (unidad_medida !== undefined) {
            camposActualizar.push('unidad_medida = ?');
            valoresActualizar.push(unidad_medida);
        }
        if (cantidad !== undefined) {
            camposActualizar.push('cantidad = ?');
            valoresActualizar.push(cantidad);
        }

        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }

        // Actualizar
        const query = `
            UPDATE articulo_contenido 
            SET ${camposActualizar.join(', ')} 
            WHERE articulo_id = ? AND ingrediente_id = ?
        `;

        valoresActualizar.push(id, ingrediente_id);

        await db.execute(query, valoresActualizar);

        // Auditar cambios
        await auditarOperacion(req, {
            accion: 'UPDATE_CONTENIDO_ARTICULO',
            tabla: 'articulo_contenido',
            registroId: datosAnteriores.id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Contenido actualizado: ${datosAnteriores.ingrediente_nombre} en ${datosAnteriores.articulo_nombre}`
        });

        console.log(`✅ Contenido actualizado: ${datosAnteriores.ingrediente_nombre} en ${datosAnteriores.articulo_nombre}`);

        res.json({
            success: true,
            message: 'Contenido de artículo actualizado exitosamente',
            data: {
                articulo_id: parseInt(id),
                ingrediente_id: parseInt(ingrediente_id)
            }
        });

    } catch (error) {
        console.error('❌ Error editando contenido de artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar contenido de artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Eliminar ingrediente de artículo elaborado
 */
const eliminarIngredienteDeArticulo = async (req, res) => {
    try {
        const { id, ingrediente_id } = req.params;

        console.log(`🗑️ Eliminando ingrediente de artículo - Artículo: ${id}, Ingrediente: ${ingrediente_id}`);

        // Verificar que existe la relación
        const [contenidoExiste] = await db.execute(`
            SELECT ac.id, a.nombre as articulo_nombre, i.nombre as ingrediente_nombre
            FROM articulo_contenido ac
            INNER JOIN articulos a ON ac.articulo_id = a.id
            INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
            WHERE ac.articulo_id = ? AND ac.ingrediente_id = ?
        `, [id, ingrediente_id]);

        if (contenidoExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Relación artículo-ingrediente no encontrada'
            });
        }

        const datosAnteriores = contenidoExiste[0];

        // Eliminar relación
        await db.execute(
            'DELETE FROM articulo_contenido WHERE articulo_id = ? AND ingrediente_id = ?',
            [id, ingrediente_id]
        );

        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_INGREDIENTE_ARTICULO',
            tabla: 'articulo_contenido',
            registroId: datosAnteriores.id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Ingrediente "${datosAnteriores.ingrediente_nombre}" eliminado de artículo "${datosAnteriores.articulo_nombre}"`
        });

        console.log(`✅ Ingrediente eliminado: ${datosAnteriores.ingrediente_nombre} de ${datosAnteriores.articulo_nombre}`);

        res.json({
            success: true,
            message: 'Ingrediente eliminado del artículo exitosamente',
            data: {
                articulo_nombre: datosAnteriores.articulo_nombre,
                ingrediente_nombre: datosAnteriores.ingrediente_nombre
            }
        });

    } catch (error) {
        console.error('❌ Error eliminando ingrediente de artículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar ingrediente del artículo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Obtener artículos con stock bajo
 */
const obtenerStockBajo = async (req, res) => {
    try {
        console.log('⚠️ Obteniendo artículos con stock bajo...');

        const query = `
            SELECT 
                a.id, a.nombre, a.stock_actual, a.stock_minimo,
                a.precio, a.tipo,
                c.nombre as categoria_nombre
            FROM articulos a
            INNER JOIN categorias c ON a.categoria_id = c.id
            WHERE a.stock_actual <= a.stock_minimo 
            AND a.activo = "1"
            ORDER BY a.stock_actual ASC, a.nombre
        `;

        const [resultados] = await db.execute(query);

        console.log(`⚠️ Artículos con stock bajo encontrados: ${resultados.length}`);

        res.json({
            success: true,
            data: resultados,
            total: resultados.length,
            message: resultados.length > 0 
                ? `${resultados.length} artículos requieren reposición`
                : 'No hay artículos con stock bajo'
        });

    } catch (error) {
        console.error('❌ Error obteniendo stock bajo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener artículos con stock bajo',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener categorías para dropdowns
 */
const obtenerCategorias = async (req, res) => {
    try {
        const query = 'SELECT id, nombre, descripcion, orden, activo FROM categorias WHERE activo = "1" ORDER BY orden, nombre';
        const [categorias] = await db.execute(query);

        res.json({
            success: true,
            data: categorias
        });

    } catch (error) {
        console.error('❌ Error obteniendo categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener categorías',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Crear nueva categoría
 */
const crearCategoria = async (req, res) => {
    try {
        console.log('📁 Creando nueva categoría...');

        const { nombre, descripcion } = req.body;

        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'El nombre de la categoría es obligatorio'
            });
        }

        // Verificar nombre único
        const [nombreExistente] = await db.execute(
            'SELECT id FROM categorias WHERE nombre = ?',
            [nombre.trim()]
        );

        if (nombreExistente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una categoría con ese nombre'
            });
        }

        // ✅ Obtener el orden máximo actual
        const [maxOrdenResult] = await db.execute(
            'SELECT MAX(orden) as maxOrden FROM categorias WHERE activo = "1"'
        );

        // ✅ Calcular siguiente orden
        const nuevoOrden = (maxOrdenResult[0].maxOrden || 0) + 1;

        // Insertar categoría
        const query = `
            INSERT INTO categorias (nombre, descripcion, orden, activo)
            VALUES (?, ?, ?, 1)
        `;

        const [result] = await db.execute(query, [
            nombre.trim(),
            descripcion || null,
            nuevoOrden // ✅ Usar orden calculado
        ]);

        // Auditar creación
        await auditarOperacion(req, {
            accion: 'CREATE_CATEGORIA',
            tabla: 'categorias',
            registroId: result.insertId,
            datosNuevos: limpiarDatosSensibles({ nombre, descripcion, orden: nuevoOrden }),
            detallesAdicionales: `Categoría creada: ${nombre}`
        });

        console.log(`✅ Categoría creada: ${nombre} - ID: ${result.insertId}`);

        res.status(201).json({
            success: true,
            message: 'Categoría creada exitosamente',
            data: {
                id: result.insertId,
                nombre,
                descripcion,
                orden: nuevoOrden
            }
        });

    } catch (error) {
        console.error('❌ Error creando categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear categoría',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener categoría por ID
 */
const obtenerCategoria = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de categoría inválido'
            });
        }

        const [categorias] = await db.execute(
            'SELECT id, nombre, descripcion, orden, activo FROM categorias WHERE id = ?',
            [id]
        );

        if (categorias.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }

        // Obtener cantidad de artículos en esta categoría
        const [countArticulos] = await db.execute(
            'SELECT COUNT(*) as total_articulos FROM articulos WHERE categoria_id = ? AND activo = "1"',
            [id]
        );

        const categoria = {
            ...categorias[0],
            total_articulos: countArticulos[0].total_articulos
        };

        res.json({
            success: true,
            data: categoria
        });

    } catch (error) {
        console.error('❌ Error obteniendo categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener categoría',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Editar categoría existente
 */
const editarCategoria = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, orden } = req.body;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de categoría inválido'
            });
        }

        // Obtener datos anteriores
        const datosAnteriores = await obtenerDatosAnteriores('categorias', id);
        if (!datosAnteriores) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }

        // Verificar nombre único si se está cambiando
        if (nombre && nombre !== datosAnteriores.nombre) {
            const [nombreExistente] = await db.execute(
                'SELECT id FROM categorias WHERE nombre = ? AND id != ? AND activo = "1"',
                [nombre, id]
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
            valoresActualizar.push(descripcion || null);
        }
        if (orden !== undefined) {
            camposActualizar.push('orden = ?');
            valoresActualizar.push(parseInt(orden) || 0);
        }

        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }

        // Actualizar categoría
        const query = `UPDATE categorias SET ${camposActualizar.join(', ')} WHERE id = ? AND activo = "1"`;
        valoresActualizar.push(id);

        await db.execute(query, valoresActualizar);

        // Auditar cambios
        await auditarOperacion(req, {
            accion: 'UPDATE_CATEGORIA',
            tabla: 'categorias',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            datosNuevos: limpiarDatosSensibles(req.body),
            detallesAdicionales: `Categoría actualizada: ${nombre || datosAnteriores.nombre}`
        });

        console.log(`✅ Categoría actualizada: ID ${id}`);

        res.json({
            success: true,
            message: 'Categoría actualizada exitosamente',
            data: { id: parseInt(id) }
        });

    } catch (error) {
        console.error('❌ Error editando categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al editar categoría',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Eliminar categoría - (soft delete)
 */
const eliminarCategoria = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de categoría inválido'
            });
        }

        // Obtener datos de la categoría
        const datosAnteriores = await obtenerDatosAnteriores('categorias', id);
        if (!datosAnteriores || datosAnteriores.activo != 1) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }

        // Verificar si tiene artículos asociados
        const [tieneArticulos] = await db.execute(
            'SELECT COUNT(*) as count FROM articulos WHERE categoria_id = ? AND activo = "1"',
            [id]
        );

        if (tieneArticulos[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `No se puede eliminar la categoría porque tiene ${tieneArticulos[0].count} artículos asociados`,
                articulos_asociados: tieneArticulos[0].count
            });
        }

        // Eliminar categoría
        await db.execute('UPDATE categorias SET activo = "0" WHERE id = ?', [id]);

        // Auditar eliminación
        await auditarOperacion(req, {
            accion: 'DELETE_CATEGORIA',
            tabla: 'categorias',
            registroId: id,
            datosAnteriores: limpiarDatosSensibles(datosAnteriores),
            detallesAdicionales: `Categoría eliminada: ${datosAnteriores.nombre}`
        });

        console.log(`✅ Categoría eliminada: ${datosAnteriores.nombre} - ID: ${id}`);

        res.json({
            success: true,
            message: 'Categoría eliminada exitosamente',
            data: { id: parseInt(id), nombre: datosAnteriores.nombre }
        });

    } catch (error) {
        console.error('❌ Error eliminando categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar categoría',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Listar categorías con filtros y paginación
 */
const filtrarCategorias = async (req, res) => {
    try {
        console.log('🔍 Filtrando categorías...');

        const {
            nombre,
            limite = 10,
            pagina = 1
        } = req.query;

        let whereConditions = ['c.activo = "1"'];
        let queryParams = [];

        // Filtro por nombre
        if (nombre && nombre.trim() !== '') {
            whereConditions.push('nombre LIKE ?');
            queryParams.push(`%${nombre.trim()}%`);
        }

        const whereClause = whereConditions.join(' AND ');

        // Query principal con conteo de artículos
        let query = `
            SELECT 
                c.id, c.nombre, c.descripcion, c.orden, c.activo,
                COUNT(a.id) as total_articulos
            FROM categorias c
            LEFT JOIN articulos a ON c.id = a.categoria_id AND a.activo = 1
            WHERE ${whereClause}
            GROUP BY c.id, c.nombre, c.descripcion, c.orden, c.activo
            ORDER BY c.orden, c.nombre
        `;

        // Paginación -- Cambie limite por 10 y maximo de 30
        const limiteNum = Math.min(parseInt(limite) || 10, 30);
        const paginaNum = Math.max(parseInt(pagina) || 1, 1);
        const offset = (paginaNum - 1) * limiteNum;

        query += ` LIMIT ${limiteNum} OFFSET ${offset}`;

        const [resultados] = await db.execute(query, queryParams);

        // Query de conteo
        const queryCount = `SELECT COUNT(*) as total FROM categorias WHERE ${whereClause}`;
        const [countResult] = await db.execute(queryCount, queryParams);
        const total = countResult[0].total;

        console.log(`✅ Categorías encontradas: ${resultados.length}, Total: ${total}`);

        res.json({
            success: true,
            data: resultados,
            meta: {
                pagina_actual: paginaNum,
                total_registros: total,
                total_paginas: Math.ceil(total / limiteNum),
                registros_por_pagina: limiteNum,
                hay_mas: (paginaNum * limiteNum) < total
            }
        });

    } catch (error) {
        console.error('❌ Error filtrando categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al filtrar categorías',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Calcular costo de un artículo elaborado
 */
const calcularCostoElaborado = async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que es elaborado
        const [articulo] = await db.execute(
            'SELECT nombre, tipo FROM articulos WHERE id = ? AND tipo = "ELABORADO" AND activo = 1',
            [id]
        );

        if (articulo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Artículo elaborado no encontrado'
            });
        }

        // Calcular costo
        const query = `
            SELECT 
                SUM(i.precio_extra * ac.cantidad) as costo_total,
                COUNT(*) as total_ingredientes
            FROM articulo_contenido ac
            INNER JOIN ingredientes i ON ac.ingrediente_id = i.id
            WHERE ac.articulo_id = ?
        `;

        const [resultado] = await db.execute(query, [id]);

        const costoTotal = parseFloat(resultado[0].costo_total || 0);
        const totalIngredientes = parseInt(resultado[0].total_ingredientes || 0);

        res.json({
            success: true,
            data: {
                articulo_nombre: articulo[0].nombre,
                costo_ingredientes: costoTotal,
                total_ingredientes: totalIngredientes,
                costo_promedio_por_ingrediente: totalIngredientes > 0 ? costoTotal / totalIngredientes : 0
            }
        });

    } catch (error) {
        console.error('❌ Error calculando costo de elaborado:', error);
        res.status(500).json({
            success: false,
            message: 'Error al calcular costo de artículo elaborado',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    // Artículos
    crearArticulo,
    obtenerArticulo,
    filtrarArticulos,
    editarArticulo,
    eliminarArticulo,
    
    // Ingredientes
    crearIngrediente,
    obtenerIngrediente,
    filtrarIngredientes,
    editarIngrediente,
    eliminarIngrediente,
    
    // Contenido de elaborados
    obtenerContenidoArticulo,
    agregarIngredienteAArticulo,
    editarContenidoArticulo,
    eliminarIngredienteDeArticulo,
    
    // Categorías
    crearCategoria,
    obtenerCategoria,
    filtrarCategorias,
    editarCategoria,
    eliminarCategoria,
    obtenerCategorias,
    
    // Auxiliares
    obtenerStockBajo,
    calcularCostoElaborado
}