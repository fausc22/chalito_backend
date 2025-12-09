const db = require('./dbPromise');

/**
 * Controller para gestión de artículos con validación y seguridad
 */

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

        res.json(articulos[0]);
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
            imagen_url,
            activo = true
        } = req.body;

        // Validaciones
        const errores = [];

        if (!nombre || nombre.trim() === '') {
            errores.push('El nombre es obligatorio');
        }

        if (!precio || isNaN(precio) || parseFloat(precio) < 0) {
            errores.push('El precio debe ser mayor o igual a 0');
        }

        if (!categoria_id || isNaN(categoria_id)) {
            errores.push('La categoría es obligatoria');
        }

        if (stock_actual !== undefined && (isNaN(stock_actual) || parseInt(stock_actual) < 0)) {
            errores.push('El stock actual debe ser un número positivo o cero');
        }

        if (stock_minimo !== undefined && (isNaN(stock_minimo) || parseInt(stock_minimo) < 0)) {
            errores.push('El stock mínimo debe ser un número positivo o cero');
        }

        if (errores.length > 0) {
            return res.status(400).json({
                error: 'Errores de validación',
                errores
            });
        }

        // Verificar que la categoría existe
        const [categoriaExiste] = await db.execute(
            'SELECT id FROM categorias WHERE id = ?',
            [categoria_id]
        );

        if (categoriaExiste.length === 0) {
            return res.status(404).json({ error: 'La categoría especificada no existe' });
        }

        // Verificar si el código de barra ya existe (si se proporciona)
        if (codigo_barra) {
            const [existente] = await db.execute(
                'SELECT id FROM articulos WHERE codigo_barra = ?',
                [codigo_barra.trim()]
            );

            if (existente.length > 0) {
                return res.status(409).json({ error: 'El código de barra ya existe' });
            }
        }

        // Insertar artículo
        const [result] = await db.execute(
            `INSERT INTO articulos (
                categoria_id, codigo_barra, nombre, descripcion, precio,
                stock_actual, stock_minimo, tipo, imagen_url, activo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                parseInt(categoria_id),
                codigo_barra ? codigo_barra.trim() : null,
                nombre.trim(),
                descripcion ? descripcion.trim() : null,
                parseFloat(precio),
                parseInt(stock_actual),
                parseInt(stock_minimo),
                tipo,
                imagen_url || null,
                activo ? 1 : 0
            ]
        );

        // Obtener el artículo creado con el nombre de la categoría
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
        console.error('❌ Error al crear artículo:', error);
        res.status(500).json({
            error: 'Error al crear artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Actualizar un artículo existente
 * PUT /articulos/:id
 */
const actualizarArticulo = async (req, res) => {
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
            imagen_url,
            activo
        } = req.body;

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

        // Validaciones
        const errores = [];

        if (nombre !== undefined && (!nombre || nombre.trim() === '')) {
            errores.push('El nombre no puede estar vacío');
        }

        if (precio !== undefined && (isNaN(precio) || parseFloat(precio) < 0)) {
            errores.push('El precio debe ser mayor o igual a 0');
        }

        if (categoria_id !== undefined && (!categoria_id || isNaN(categoria_id))) {
            errores.push('La categoría no puede estar vacía');
        }

        if (stock_actual !== undefined && (isNaN(stock_actual) || parseInt(stock_actual) < 0)) {
            errores.push('El stock actual debe ser un número positivo o cero');
        }

        if (stock_minimo !== undefined && (isNaN(stock_minimo) || parseInt(stock_minimo) < 0)) {
            errores.push('El stock mínimo debe ser un número positivo o cero');
        }

        if (errores.length > 0) {
            return res.status(400).json({
                error: 'Errores de validación',
                errores
            });
        }

        // Verificar que la categoría existe (si se proporciona)
        if (categoria_id !== undefined) {
            const [categoriaExiste] = await db.execute(
                'SELECT id FROM categorias WHERE id = ?',
                [categoria_id]
            );

            if (categoriaExiste.length === 0) {
                return res.status(404).json({ error: 'La categoría especificada no existe' });
            }
        }

        // Si se cambia el código de barra, verificar que no exista en otro artículo
        if (codigo_barra && codigo_barra !== articuloExistente[0].codigo_barra) {
            const [codigoExistente] = await db.execute(
                'SELECT id FROM articulos WHERE codigo_barra = ? AND id != ?',
                [codigo_barra.trim(), id]
            );

            if (codigoExistente.length > 0) {
                return res.status(409).json({ error: 'El código de barra ya existe' });
            }
        }

        // Construir query de actualización dinámicamente
        const campos = [];
        const valores = [];

        if (codigo_barra !== undefined) {
            campos.push('codigo_barra = ?');
            valores.push(codigo_barra ? codigo_barra.trim() : null);
        }

        if (nombre !== undefined) {
            campos.push('nombre = ?');
            valores.push(nombre.trim());
        }

        if (descripcion !== undefined) {
            campos.push('descripcion = ?');
            valores.push(descripcion ? descripcion.trim() : null);
        }

        if (precio !== undefined) {
            campos.push('precio = ?');
            valores.push(parseFloat(precio));
        }

        if (categoria_id !== undefined) {
            campos.push('categoria_id = ?');
            valores.push(parseInt(categoria_id));
        }

        if (stock_actual !== undefined) {
            campos.push('stock_actual = ?');
            valores.push(parseInt(stock_actual));
        }

        if (stock_minimo !== undefined) {
            campos.push('stock_minimo = ?');
            valores.push(parseInt(stock_minimo));
        }

        if (tipo !== undefined) {
            campos.push('tipo = ?');
            valores.push(tipo);
        }

        if (imagen_url !== undefined) {
            campos.push('imagen_url = ?');
            valores.push(imagen_url || null);
        }

        if (activo !== undefined) {
            campos.push('activo = ?');
            valores.push(activo ? 1 : 0);
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        // Agregar ID al final de los valores
        valores.push(id);

        // Ejecutar actualización
        await db.execute(
            `UPDATE articulos SET ${campos.join(', ')} WHERE id = ?`,
            valores
        );

        // Obtener el artículo actualizado con el nombre de la categoría
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
        console.error('❌ Error al actualizar artículo:', error);
        res.status(500).json({
            error: 'Error al actualizar artículo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

module.exports = {
    obtenerArticulos,
    obtenerArticuloPorId,
    obtenerCategorias,
    crearArticulo,
    actualizarArticulo,
    eliminarArticulo
};
