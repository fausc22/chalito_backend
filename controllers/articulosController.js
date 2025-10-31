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

        let query = 'SELECT * FROM articulos WHERE 1=1';
        const params = [];

        // Filtro por categoría
        if (categoria) {
            query += ' AND categoria = ?';
            params.push(categoria);
        }

        // Filtro por disponibilidad
        if (disponible !== undefined) {
            const disponibleBool = disponible === 'true' || disponible === '1';
            query += ' AND disponible = ?';
            params.push(disponibleBool);
        }

        // Ordenar por nombre
        query += ' ORDER BY nombre ASC';

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
            'SELECT * FROM articulos WHERE id = ?',
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
            'SELECT DISTINCT categoria FROM articulos WHERE categoria IS NOT NULL ORDER BY categoria ASC'
        );

        // Extraer solo los valores de categoría
        const listaCategorias = categorias.map(cat => cat.categoria);

        res.json(listaCategorias);
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
            codigo,
            nombre,
            descripcion,
            precio,
            categoria,
            tiempoPreparacion,
            disponible = true,
            imagen
        } = req.body;

        // Validaciones
        const errores = [];

        if (!codigo || codigo.trim() === '') {
            errores.push('El código es obligatorio');
        }

        if (!nombre || nombre.trim() === '') {
            errores.push('El nombre es obligatorio');
        }

        if (!precio || isNaN(precio) || parseFloat(precio) <= 0) {
            errores.push('El precio debe ser mayor a 0');
        }

        if (!categoria || categoria.trim() === '') {
            errores.push('La categoría es obligatoria');
        }

        if (tiempoPreparacion && (isNaN(tiempoPreparacion) || parseInt(tiempoPreparacion) < 0)) {
            errores.push('El tiempo de preparación debe ser un número positivo');
        }

        if (errores.length > 0) {
            return res.status(400).json({
                error: 'Errores de validación',
                errores
            });
        }

        // Verificar si el código ya existe
        const [existente] = await db.execute(
            'SELECT id FROM articulos WHERE codigo = ?',
            [codigo.trim()]
        );

        if (existente.length > 0) {
            return res.status(409).json({ error: 'El código de artículo ya existe' });
        }

        // Insertar artículo
        const [result] = await db.execute(
            `INSERT INTO articulos (
                codigo, nombre, descripcion, precio, categoria,
                tiempoPreparacion, disponible, imagen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                codigo.trim(),
                nombre.trim(),
                descripcion ? descripcion.trim() : null,
                parseFloat(precio),
                categoria.trim(),
                tiempoPreparacion ? parseInt(tiempoPreparacion) : null,
                disponible === true || disponible === 'true' || disponible === 1,
                imagen || null
            ]
        );

        // Obtener el artículo creado
        const [nuevoArticulo] = await db.execute(
            'SELECT * FROM articulos WHERE id = ?',
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
            codigo,
            nombre,
            descripcion,
            precio,
            categoria,
            tiempoPreparacion,
            disponible,
            imagen
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

        if (codigo !== undefined && (!codigo || codigo.trim() === '')) {
            errores.push('El código no puede estar vacío');
        }

        if (nombre !== undefined && (!nombre || nombre.trim() === '')) {
            errores.push('El nombre no puede estar vacío');
        }

        if (precio !== undefined && (isNaN(precio) || parseFloat(precio) <= 0)) {
            errores.push('El precio debe ser mayor a 0');
        }

        if (categoria !== undefined && (!categoria || categoria.trim() === '')) {
            errores.push('La categoría no puede estar vacía');
        }

        if (tiempoPreparacion !== undefined && (isNaN(tiempoPreparacion) || parseInt(tiempoPreparacion) < 0)) {
            errores.push('El tiempo de preparación debe ser un número positivo');
        }

        if (errores.length > 0) {
            return res.status(400).json({
                error: 'Errores de validación',
                errores
            });
        }

        // Si se cambia el código, verificar que no exista en otro artículo
        if (codigo && codigo !== articuloExistente[0].codigo) {
            const [codigoExistente] = await db.execute(
                'SELECT id FROM articulos WHERE codigo = ? AND id != ?',
                [codigo.trim(), id]
            );

            if (codigoExistente.length > 0) {
                return res.status(409).json({ error: 'El código de artículo ya existe' });
            }
        }

        // Construir query de actualización dinámicamente
        const campos = [];
        const valores = [];

        if (codigo !== undefined) {
            campos.push('codigo = ?');
            valores.push(codigo.trim());
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

        if (categoria !== undefined) {
            campos.push('categoria = ?');
            valores.push(categoria.trim());
        }

        if (tiempoPreparacion !== undefined) {
            campos.push('tiempoPreparacion = ?');
            valores.push(tiempoPreparacion ? parseInt(tiempoPreparacion) : null);
        }

        if (disponible !== undefined) {
            campos.push('disponible = ?');
            valores.push(disponible === true || disponible === 'true' || disponible === 1);
        }

        if (imagen !== undefined) {
            campos.push('imagen = ?');
            valores.push(imagen || null);
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

        // Obtener el artículo actualizado
        const [articuloActualizado] = await db.execute(
            'SELECT * FROM articulos WHERE id = ?',
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
 * Eliminar un artículo (soft delete - marcar como no disponible)
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

        // Soft delete: marcar como no disponible
        await db.execute(
            'UPDATE articulos SET disponible = false WHERE id = ?',
            [id]
        );

        res.json({
            message: 'Artículo marcado como no disponible',
            articulo: { ...articuloExistente[0], disponible: false }
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
