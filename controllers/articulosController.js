const crypto = require('crypto');
const db = require('./dbPromise');
const multer = require('multer');
const axios = require('axios');
const { uploadImageToCloudinary } = require('../config/cloudinary');
const {
    calcularCostoArticuloElaborado: calcularCostoArticuloElaboradoService,
    ERROR_CODES: COSTO_ERROR_CODES
} = require('../services/ArticulosCostService');
const {
    defaultControlaStockPorTipo,
    normalizarTipoArticulo,
    parseBooleanFlexible
} = require('../services/articuloStockPolicy');

/**
 * Controller para gestión de artículos con validación y seguridad
 */

// =====================================================
// CONFIGURACIÓN DE MULTER PARA SUBIDA DE IMÁGENES
// =====================================================

// Almacenar en memoria (NO en disco)
const storage = multer.memoryStorage();

// Validar tipo de archivo
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error('Tipo de archivo no permitido. Solo JPG, JPEG, PNG, WEBP');
        error.status = 400;
        cb(error, false);
    }
};

// Configurar multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB máximo
        files: 1 // Solo 1 archivo
    }
});

// Middleware de multer para una sola imagen
const uploadSingle = upload.single('imagen');

const normalizarPeso = (peso, { requerido = false } = {}) => {
    if (peso === undefined || peso === null || peso === '') {
        if (requerido) {
            return { valido: false, mensaje: 'El peso es obligatorio' };
        }
        return { valido: true, valor: undefined };
    }

    const pesoNumero = Number(peso);
    if (!Number.isInteger(pesoNumero)) {
        return { valido: false, mensaje: 'El peso debe ser un número entero' };
    }

    if (pesoNumero < 1 || pesoNumero > 4) {
        return { valido: false, mensaje: 'El peso debe estar entre 1 y 4' };
    }

    return { valido: true, valor: pesoNumero };
};

const validarIngredientes = (ingredientes) => {
    if (!Array.isArray(ingredientes)) {
        return { valido: false, mensaje: 'ingredientes debe ser un array' };
    }

    for (const ingrediente of ingredientes) {
        const ingredienteId = Number(ingrediente?.ingrediente_id);
        const cantidad = Number(ingrediente?.cantidad);
        if (!Number.isInteger(ingredienteId) || ingredienteId <= 0) {
            return { valido: false, mensaje: 'Cada ingrediente debe tener ingrediente_id válido' };
        }
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
            return { valido: false, mensaje: 'Cada ingrediente debe tener una cantidad mayor a 0' };
        }
    }

    return { valido: true };
};

const sincronizarContenidoElaborado = async (connection, articuloId, ingredientes = []) => {
    await connection.execute('DELETE FROM articulos_contenido WHERE articulo_id = ?', [articuloId]);

    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
        return;
    }

    for (const ingrediente of ingredientes) {
        await connection.execute(
            `INSERT INTO articulos_contenido (
                articulo_id, ingrediente_id, unidad_medida, cantidad
            ) VALUES (?, ?, ?, ?)`,
            [
                articuloId,
                Number(ingrediente.ingrediente_id),
                ingrediente.unidad_medida || 'UNIDADES',
                Number(ingrediente.cantidad)
            ]
        );
    }
};

// =====================================================
// ENDPOINT: SUBIR IMAGEN A CLOUDINARY
// =====================================================

/**
 * Subir imagen a Cloudinary
 * POST /articulos/upload-imagen
 * Body: multipart/form-data con campo 'imagen'
 * Retorna: { imagen_url, public_id }
 */
const uploadImagen = async (req, res) => {
    try {
        // Validar que venga un archivo
        if (!req.file) {
            return res.status(400).json({
                error: 'No se proporcionó ninguna imagen',
                message: 'Debe enviar un archivo en el campo "imagen"'
            });
        }

        // Validar tamaño
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                error: 'Archivo demasiado grande',
                message: 'El tamaño máximo permitido es 5MB'
            });
        }

        console.log(`📤 Subiendo imagen: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)}KB)`);

        // Subir a Cloudinary
        const result = await uploadImageToCloudinary(req.file.buffer, {
            folder: 'chalito/articulos'
        });

        // Respuesta exitosa
        res.status(200).json({
            success: true,
            message: 'Imagen subida exitosamente',
            data: {
                imagen_url: result.secure_url,
                public_id: result.public_id,
                width: result.width,
                height: result.height,
                format: result.format,
                size: result.bytes
            }
        });

    } catch (error) {
        console.error('❌ Error al subir imagen:', error);
        
        // Manejar errores de Cloudinary
        if (error.http_code) {
            return res.status(error.http_code).json({
                error: 'Error de Cloudinary',
                message: error.message
            });
        }

        // Error genérico
        res.status(500).json({
            error: 'Error al subir imagen',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'
        });
    }
};

// =====================================================
// ENDPOINTS EXISTENTES (sin cambios)
// =====================================================

/**
 * Obtener todos los artículos con filtros opcionales
 * GET /articulos?categoria=X&disponible=true
 */
const obtenerArticulos = async (req, res) => {
    try {
        const { categoria, disponible } = req.query;

        let query = `
            SELECT 
                a.*,
                c.nombre as categoria_nombre
            FROM articulos a
            LEFT JOIN categorias c ON a.categoria_id = c.id
            WHERE 1=1
        `;
        const params = [];

        // Filtro por categoría (puede ser ID o nombre)
        if (categoria) {
            query += ' AND (a.categoria_id = ? OR c.nombre = ?)';
            params.push(categoria, categoria);
        }

        // Filtro por disponibilidad (usando el campo 'activo')
        if (disponible !== undefined) {
            const disponibleBool = disponible === 'true' || disponible === '1';
            query += ' AND a.activo = ?';
            params.push(disponibleBool);
        }

        // Ordenar por nombre
        query += ' ORDER BY a.nombre ASC';

        const [articulos] = await db.execute(query, params);

        res.json(articulos);
    } catch (error) {
        console.error('❌ Error al obtener artículos:', error);
        res.status(500).json({
            error: 'Error al obtener artículos',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener un artículo por ID
 * GET /articulos/:id
 */
const obtenerArticuloPorId = async (req, res) => {
    try {
        const { id } = req.params;

        // Validación del ID
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'ID de artículo inválido' });
        }

        const [articulos] = await db.execute(
            `SELECT 
                a.*,
                c.nombre as categoria_nombre
            FROM articulos a
            LEFT JOIN categorias c ON a.categoria_id = c.id
            WHERE a.id = ?`,
            [id]
        );

        if (articulos.length === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }

        const articulo = articulos[0];
        let contenido = [];

        if (articulo.tipo === 'ELABORADO') {
            const [ingredientes] = await db.execute(
                `SELECT 
                    ac.ingrediente_id,
                    i.nombre,
                    ac.cantidad,
                    ac.unidad_medida
                 FROM articulos_contenido ac
                 INNER JOIN ingredientes i ON i.id = ac.ingrediente_id
                 WHERE ac.articulo_id = ?
                 ORDER BY i.nombre ASC`,
                [id]
            );
            contenido = ingredientes;
        }

        res.json({
            ...articulo,
            contenido
        });
    } catch (error) {
        console.error('❌ Error al obtener artículo:', error);
        res.status(500).json({
            error: 'Error al obtener artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Obtener lista de categorías únicas
 * GET /articulos/categorias
 */
const obtenerCategorias = async (req, res) => {
    try {
        const [categorias] = await db.execute(
            `SELECT 
                c.id, 
                c.nombre, 
                c.descripcion,
                c.orden
            FROM categorias c
            ORDER BY c.orden ASC, c.nombre ASC`
        );

        res.json(categorias);
    } catch (error) {
        console.error('❌ Error al obtener categorías:', error);
        res.status(500).json({
            error: 'Error al obtener categorías',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Crear un nuevo artículo
 * POST /articulos
 */
const crearArticulo = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const {
            codigo_barra,
            nombre,
            descripcion,
            precio,
            categoria_id,
            stock_actual = 0,
            stock_minimo = 0,
            tipo = 'OTRO',
            controla_stock,
            imagen_url,
            activo = true,
            peso,
            ingredientes = []
        } = req.body;

        const tipoNormalizado = normalizarTipoArticulo(tipo);
        const pesoConFallback = peso ?? 1;
        const controlaStockParseado = parseBooleanFlexible(controla_stock);

        console.log('[articulos][create] Payload recibido', {
            nombre,
            categoria_id,
            tipo: tipoNormalizado,
            controla_stock_recibido: controla_stock,
            peso_recibido: req.body?.peso,
            peso_usado: pesoConFallback
        });

        const errores = [];
        if (!nombre || nombre.trim() === '') errores.push('El nombre es obligatorio');
        if (!precio || isNaN(precio) || parseFloat(precio) < 0) errores.push('El precio debe ser mayor o igual a 0');
        if (!categoria_id || isNaN(categoria_id)) errores.push('La categoría es obligatoria');
        if (!controlaStockParseado.valido) errores.push(controlaStockParseado.mensaje);

        const controlaStockFinal = controlaStockParseado.valor !== undefined
            ? controlaStockParseado.valor
            : defaultControlaStockPorTipo(tipoNormalizado);

        if (controlaStockFinal) {
            if (stock_actual !== undefined && isNaN(stock_actual)) errores.push('El stock actual debe ser un número');
            if (stock_minimo !== undefined && (isNaN(stock_minimo) || parseInt(stock_minimo, 10) < 0)) errores.push('El stock mínimo debe ser un número positivo o cero');
        }

        const pesoValidacion = normalizarPeso(pesoConFallback, { requerido: true });
        if (!pesoValidacion.valido) errores.push(pesoValidacion.mensaje);

        const ingredientesValidacion = validarIngredientes(ingredientes);
        if (!ingredientesValidacion.valido) errores.push(ingredientesValidacion.mensaje);

        if (errores.length > 0) {
            return res.status(400).json({ error: 'Errores de validación', errores });
        }

        const stockActualFinal = controlaStockFinal ? parseInt(stock_actual, 10) : 0;
        const stockMinimoFinal = controlaStockFinal ? parseInt(stock_minimo, 10) : 0;

        await connection.beginTransaction();

        const [categoriaExiste] = await connection.execute('SELECT id FROM categorias WHERE id = ?', [categoria_id]);
        if (categoriaExiste.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'La categoría especificada no existe' });
        }

        if (codigo_barra) {
            const [existente] = await connection.execute(
                'SELECT id FROM articulos WHERE codigo_barra = ?',
                [codigo_barra.trim()]
            );
            if (existente.length > 0) {
                await connection.rollback();
                return res.status(409).json({ error: 'El código de barra ya existe' });
            }
        }

        const [result] = await connection.execute(
            `INSERT INTO articulos (
                categoria_id, codigo_barra, nombre, descripcion, precio,
                stock_actual, stock_minimo, tipo, controla_stock, imagen_url, activo, peso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                parseInt(categoria_id, 10),
                codigo_barra ? codigo_barra.trim() : null,
                nombre.trim(),
                descripcion ? descripcion.trim() : null,
                parseFloat(precio),
                stockActualFinal,
                stockMinimoFinal,
                tipoNormalizado,
                controlaStockFinal ? 1 : 0,
                imagen_url || null,
                activo ? 1 : 0,
                pesoValidacion.valor
            ]
        );

        if (tipoNormalizado === 'ELABORADO') {
            await sincronizarContenidoElaborado(connection, result.insertId, ingredientes);
        }

        await connection.commit();

        console.log('[articulos][create] Query INSERT', {
            articulo_id: result.insertId,
            peso_enviado_query: pesoValidacion.valor
        });

        const [nuevoArticulo] = await db.execute(
            `SELECT 
                a.*,
                c.nombre as categoria_nombre
            FROM articulos a
            LEFT JOIN categorias c ON a.categoria_id = c.id
            WHERE a.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            message: 'Artículo creado exitosamente',
            articulo: nuevoArticulo[0]
        });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error('❌ Error al crear artículo:', error);
        res.status(500).json({
            error: 'Error al crear artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * Actualizar un artículo existente
 * PUT /articulos/:id
 */
const actualizarArticulo = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const {
            codigo_barra,
            nombre,
            descripcion,
            precio,
            categoria_id,
            stock_actual,
            stock_minimo,
            tipo,
            controla_stock,
            imagen_url,
            activo,
            peso,
            ingredientes
        } = req.body;

        const tipoNormalizadoInput = tipo !== undefined ? normalizarTipoArticulo(tipo) : undefined;
        const hasControlaStockEnPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'controla_stock');
        const controlaStockParseado = parseBooleanFlexible(controla_stock);

        console.log('[articulos][update] Payload recibido', {
            articulo_id: id,
            tipo_recibido: tipo,
            controla_stock_recibido: controla_stock,
            peso_recibido: req.body?.peso
        });

        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'ID de artículo inválido' });
        }

        const errores = [];
        if (nombre !== undefined && (!nombre || nombre.trim() === '')) errores.push('El nombre no puede estar vacío');
        if (precio !== undefined && (isNaN(precio) || parseFloat(precio) < 0)) errores.push('El precio debe ser mayor o igual a 0');
        if (categoria_id !== undefined && (!categoria_id || isNaN(categoria_id))) errores.push('La categoría no puede estar vacía');
        if (hasControlaStockEnPayload && !controlaStockParseado.valido) errores.push(controlaStockParseado.mensaje);

        const pesoValidacion = normalizarPeso(peso, { requerido: false });
        if (!pesoValidacion.valido) errores.push(pesoValidacion.mensaje);

        if (ingredientes !== undefined) {
            const ingredientesValidacion = validarIngredientes(ingredientes);
            if (!ingredientesValidacion.valido) errores.push(ingredientesValidacion.mensaje);
        }

        if (errores.length > 0) {
            return res.status(400).json({ error: 'Errores de validación', errores });
        }

        await connection.beginTransaction();

        const [articuloExistente] = await connection.execute('SELECT * FROM articulos WHERE id = ?', [id]);
        if (articuloExistente.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }
        const articuloActual = articuloExistente[0];
        const tipoFinal = tipoNormalizadoInput !== undefined
            ? tipoNormalizadoInput
            : normalizarTipoArticulo(articuloActual.tipo);
        const controlaStockActual = Boolean(Number(articuloActual.controla_stock));
        const controlaStockFinal = hasControlaStockEnPayload
            ? controlaStockParseado.valor
            : (tipoNormalizadoInput !== undefined
                ? defaultControlaStockPorTipo(tipoFinal)
                : controlaStockActual);

        if (controlaStockFinal) {
            if (stock_actual !== undefined && isNaN(stock_actual)) errores.push('El stock actual debe ser un número');
            if (stock_minimo !== undefined && (isNaN(stock_minimo) || parseInt(stock_minimo, 10) < 0)) errores.push('El stock mínimo debe ser un número positivo o cero');
        }

        if (errores.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Errores de validación', errores });
        }

        // Compatibilidad operativa: permitir actualizar otros campos (ej. peso)
        // en artículos heredados con stock negativo, siempre que no se intente
        // cambiar ese stock negativo a otro valor también negativo.
        if (controlaStockFinal && stock_actual !== undefined && parseInt(stock_actual, 10) < 0) {
            const stockActualBd = parseInt(articuloActual.stock_actual, 10);
            if (parseInt(stock_actual, 10) !== stockActualBd) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Errores de validación',
                    errores: ['El stock actual debe ser un número positivo o cero']
                });
            }
        }

        if (categoria_id !== undefined) {
            const [categoriaExiste] = await connection.execute('SELECT id FROM categorias WHERE id = ?', [categoria_id]);
            if (categoriaExiste.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'La categoría especificada no existe' });
            }
        }

        if (codigo_barra && codigo_barra !== articuloExistente[0].codigo_barra) {
            const [codigoExistente] = await connection.execute(
                'SELECT id FROM articulos WHERE codigo_barra = ? AND id != ?',
                [codigo_barra.trim(), id]
            );
            if (codigoExistente.length > 0) {
                await connection.rollback();
                return res.status(409).json({ error: 'El código de barra ya existe' });
            }
        }

        const campos = [];
        const valores = [];
        if (codigo_barra !== undefined) { campos.push('codigo_barra = ?'); valores.push(codigo_barra ? codigo_barra.trim() : null); }
        if (nombre !== undefined) { campos.push('nombre = ?'); valores.push(nombre.trim()); }
        if (descripcion !== undefined) { campos.push('descripcion = ?'); valores.push(descripcion ? descripcion.trim() : null); }
        if (precio !== undefined) { campos.push('precio = ?'); valores.push(parseFloat(precio)); }
        if (categoria_id !== undefined) { campos.push('categoria_id = ?'); valores.push(parseInt(categoria_id, 10)); }
        if (tipoNormalizadoInput !== undefined) { campos.push('tipo = ?'); valores.push(tipoFinal); }
        if (hasControlaStockEnPayload || tipoNormalizadoInput !== undefined) { campos.push('controla_stock = ?'); valores.push(controlaStockFinal ? 1 : 0); }
        if (imagen_url !== undefined) { campos.push('imagen_url = ?'); valores.push(imagen_url || null); }
        if (activo !== undefined) { campos.push('activo = ?'); valores.push(activo ? 1 : 0); }
        if (peso !== undefined && peso !== null && peso !== '') { campos.push('peso = ?'); valores.push(pesoValidacion.valor); }

        const forzarStockEnCero = !controlaStockFinal && (
            hasControlaStockEnPayload ||
            tipoNormalizadoInput !== undefined ||
            stock_actual !== undefined ||
            stock_minimo !== undefined
        );

        if (forzarStockEnCero) {
            campos.push('stock_actual = ?');
            valores.push(0);
            campos.push('stock_minimo = ?');
            valores.push(0);
        } else {
            if (stock_actual !== undefined) { campos.push('stock_actual = ?'); valores.push(parseInt(stock_actual, 10)); }
            if (stock_minimo !== undefined) { campos.push('stock_minimo = ?'); valores.push(parseInt(stock_minimo, 10)); }
        }

        if (campos.length === 0 && ingredientes === undefined) {
            await connection.rollback();
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        if (campos.length > 0) {
            valores.push(id);
            console.log('[articulos][update] Query UPDATE', {
                articulo_id: id,
                incluye_peso: (peso !== undefined && peso !== null && peso !== ''),
                peso_enviado_query: (peso !== undefined && peso !== null && peso !== '') ? pesoValidacion.valor : '(sin cambio)'
            });
            await connection.execute(
                `UPDATE articulos SET ${campos.join(', ')} WHERE id = ?`,
                valores
            );
        }

        if (tipoFinal === 'ELABORADO' && Array.isArray(ingredientes)) {
            await sincronizarContenidoElaborado(connection, id, ingredientes);
        } else if (tipoFinal !== 'ELABORADO') {
            await connection.execute('DELETE FROM articulos_contenido WHERE articulo_id = ?', [id]);
        }

        await connection.commit();

        const [articuloActualizado] = await db.execute(
            `SELECT 
                a.*,
                c.nombre as categoria_nombre
            FROM articulos a
            LEFT JOIN categorias c ON a.categoria_id = c.id
            WHERE a.id = ?`,
            [id]
        );

        res.json({
            message: 'Artículo actualizado exitosamente',
            articulo: articuloActualizado[0]
        });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error('❌ Error al actualizar artículo:', error);
        res.status(500).json({
            error: 'Error al actualizar artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

const obtenerAdicionalesPorArticulo = async (req, res) => {
    try {
        const { id: articuloId } = req.params;
        if (!articuloId || isNaN(parseInt(articuloId, 10))) {
            return res.status(400).json({ success: false, message: 'ID de artículo inválido' });
        }

        const [articulo] = await db.execute('SELECT id FROM articulos WHERE id = ?', [articuloId]);
        if (articulo.length === 0) {
            return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
        }

        const [adicionales] = await db.execute(
            `SELECT 
                a.id,
                a.nombre,
                a.descripcion,
                a.precio_extra,
                a.disponible,
                ac.id as contenido_id
             FROM adicionales a
             INNER JOIN adicionales_contenido ac ON a.id = ac.adicional_id
             WHERE ac.articulo_id = ?
             ORDER BY a.nombre ASC`,
            [articuloId]
        );

        return res.json({ success: true, data: adicionales });
    } catch (error) {
        console.error('❌ Error al obtener adicionales del artículo:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener adicionales del artículo' });
    }
};

const asignarAdicionalesAArticulo = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id: articuloId } = req.params;
        const { adicionales: adicionalesIds } = req.body;

        if (!articuloId || isNaN(parseInt(articuloId, 10))) {
            return res.status(400).json({ success: false, message: 'ID de artículo inválido' });
        }
        if (!Array.isArray(adicionalesIds)) {
            return res.status(400).json({ success: false, message: 'adicionales debe ser un array' });
        }

        const [articulo] = await connection.execute('SELECT id FROM articulos WHERE id = ?', [articuloId]);
        if (articulo.length === 0) {
            return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
        }

        await connection.beginTransaction();
        await connection.execute('DELETE FROM adicionales_contenido WHERE articulo_id = ?', [articuloId]);

        if (adicionalesIds.length > 0) {
            const placeholders = adicionalesIds.map(() => '?').join(',');
            const [adicionalesExistentes] = await connection.execute(
                `SELECT id FROM adicionales WHERE id IN (${placeholders})`,
                adicionalesIds
            );
            if (adicionalesExistentes.length !== adicionalesIds.length) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Uno o más adicionales no existen' });
            }

            const [maxIdResult] = await connection.execute(
                'SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM adicionales_contenido'
            );
            let nextId = maxIdResult[0]?.next_id || 1;

            for (const adicionalId of adicionalesIds) {
                await connection.execute(
                    'INSERT INTO adicionales_contenido (id, articulo_id, adicional_id) VALUES (?, ?, ?)',
                    [nextId, articuloId, adicionalId]
                );
                nextId++;
            }
        }

        await connection.commit();
        return res.json({
            success: true,
            message: 'Adicionales asignados exitosamente',
            data: { articulo_id: parseInt(articuloId, 10), adicionales: adicionalesIds }
        });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error('❌ Error al asignar adicionales:', error);
        return res.status(500).json({ success: false, message: 'Error al asignar adicionales' });
    } finally {
        connection.release();
    }
};

const eliminarAdicionalDeArticulo = async (req, res) => {
    try {
        const { id: articuloId, adicionalId } = req.params;
        if (!articuloId || isNaN(parseInt(articuloId, 10)) || !adicionalId || isNaN(parseInt(adicionalId, 10))) {
            return res.status(400).json({ success: false, message: 'IDs inválidos' });
        }

        const [existe] = await db.execute(
            'SELECT id FROM adicionales_contenido WHERE articulo_id = ? AND adicional_id = ?',
            [articuloId, adicionalId]
        );
        if (existe.length === 0) {
            return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
        }

        await db.execute(
            'DELETE FROM adicionales_contenido WHERE articulo_id = ? AND adicional_id = ?',
            [articuloId, adicionalId]
        );

        return res.json({
            success: true,
            message: 'Adicional eliminado del artículo exitosamente',
            data: { articulo_id: parseInt(articuloId, 10), adicional_id: parseInt(adicionalId, 10) }
        });
    } catch (error) {
        console.error('❌ Error al eliminar adicional del artículo:', error);
        return res.status(500).json({ success: false, message: 'Error al eliminar adicional del artículo' });
    }
};

/**
 * Eliminar un artículo (soft delete - marcar como no activo)
 * DELETE /articulos/:id
 */
const eliminarArticulo = async (req, res) => {
    try {
        const { id } = req.params;

        // Validación del ID
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'ID de artículo inválido' });
        }

        // Verificar que el artículo existe
        const [articuloExistente] = await db.execute(
            'SELECT * FROM articulos WHERE id = ?',
            [id]
        );

        if (articuloExistente.length === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }

        // Soft delete: marcar como no activo
        await db.execute(
            'UPDATE articulos SET activo = false WHERE id = ?',
            [id]
        );

        res.json({
            message: 'Artículo marcado como no activo',
            articulo: { ...articuloExistente[0], activo: false }
        });
    } catch (error) {
        console.error('❌ Error al eliminar artículo:', error);
        res.status(500).json({
            error: 'Error al eliminar artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// =====================================================
// PROXY DE IMÁGENES CON CACHE HTTP FUERTE (carta online)
// =====================================================

/** Solo permitir URLs de Cloudinary para evitar SSRF */
const CLOUDINARY_HOST = 'res.cloudinary.com';
const isValidImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && parsed.hostname === CLOUDINARY_HOST;
    } catch {
        return false;
    }
};

/**
 * Proxy de imagen por ID de artículo.
 * Sirve imágenes con Cache-Control fuerte y ETag para cache del navegador.
 * URL estable: GET /carta-publica/imagenes/:articuloId (sin query params variables)
 */
const proxyImagenArticulo = async (req, res) => {
    try {
        const { articuloId } = req.params;
        if (!articuloId || isNaN(articuloId)) {
            return res.status(400).json({ error: 'ID de artículo inválido' });
        }

        const [rows] = await db.execute(
            'SELECT imagen_url FROM articulos WHERE id = ?',
            [parseInt(articuloId, 10)]
        );

        if (rows.length === 0 || !rows[0].imagen_url) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }

        const imagenUrl = rows[0].imagen_url;
        if (!isValidImageUrl(imagenUrl)) {
            return res.status(400).json({ error: 'URL de imagen no válida' });
        }

        const etag = `"${crypto.createHash('md5').update(imagenUrl).digest('hex')}"`;
        const clientEtag = req.headers['if-none-match'];

        if (clientEtag && clientEtag.trim() === etag) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('ETag', etag);
            return res.status(304).end();
        }

        const response = await axios({
            method: 'GET',
            url: imagenUrl,
            responseType: 'stream',
            timeout: 15000,
            validateStatus: (status) => status === 200
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('ETag', etag);
        if (response.headers['last-modified']) {
            res.setHeader('Last-Modified', response.headers['last-modified']);
        }

        response.data.on('error', (err) => {
            console.error('❌ Error streaming imagen:', err.message);
            if (!res.headersSent) res.status(500).json({ error: 'Error al cargar imagen' });
        });
        response.data.pipe(res);
    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }
        console.error('❌ Error en proxy de imagen:', error.message);
        res.status(500).json({
            error: 'Error al cargar imagen',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    obtenerArticulos,
    obtenerArticuloPorId,
    obtenerCategorias,
    crearArticulo,
    actualizarArticulo,
    eliminarArticulo,
    obtenerAdicionalesPorArticulo,
    asignarAdicionalesAArticulo,
    eliminarAdicionalDeArticulo,
    uploadImagen,
    uploadSingle,
    proxyImagenArticulo,
    /**
     * Calcular costo interno de un artículo elaborado
     * GET /articulos/:id/costo
     */
    calcularCostoArticuloElaborado: async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: 'ID de artículo inválido' });
            }

            const articuloId = Number(id);

            const resultado = await calcularCostoArticuloElaboradoService(articuloId);

            if (!resultado || resultado.status !== 'OK') {
                if (resultado && resultado.code === COSTO_ERROR_CODES.ARTICULO_NO_ENCONTRADO) {
                    return res.status(404).json({ error: 'Artículo no encontrado' });
                }

                if (resultado && resultado.code === COSTO_ERROR_CODES.ARTICULO_NO_ELABORADO) {
                    return res.status(400).json({
                        error: 'El artículo no es de tipo ELABORADO',
                        articulo: resultado.articulo
                    });
                }

                return res.status(500).json({
                    error: 'Error al calcular costo del artículo'
                });
            }

            return res.json(resultado.data);
        } catch (error) {
            console.error('❌ Error al calcular costo de artículo elaborado:', error);
            return res.status(500).json({
                error: 'Error al calcular costo del artículo',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
};
