// routes/inventarioRoutes.js - Sistema Chalito
const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { middlewareAuditoria } = require('../middlewares/auditoriaMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

// ✅ Middleware para solo ADMIN y GERENTE
const soloAdminGerente = [authenticateToken, authorizeRole(['ADMIN', 'GERENTE'])];

// =====================================================
// RUTAS DE ARTÍCULOS
// =====================================================

/**
 * GET /inventario/articulos
 * Listar y filtrar artículos con paginación
 * Query params: nombre, categoria_id, tipo, stock_bajo, activo, limite, pagina
 */
router.get('/articulos', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_ARTICULOS', 
        tabla: 'articulos',
        incluirQuery: true 
    }),
    inventarioController.filtrarArticulos
);

/**
 * GET /inventario/articulos/:id
 * Obtener artículo específico con contenido si es elaborado
 */
router.get('/articulos/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_ARTICULO', 
        tabla: 'articulos' 
    }),
    inventarioController.obtenerArticulo
);

/**
 * POST /inventario/articulos
 * Crear nuevo artículo
 * Body: categoria_id, nombre, descripcion, precio, stock_actual, stock_minimo, tipo, codigo_barra, imagen_url, ingredientes[]
 */
router.post('/articulos', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'CREATE_ARTICULO', 
        tabla: 'articulos',
        incluirBody: true 
    }),
    inventarioController.crearArticulo
);

/**
 * PUT /inventario/articulos/:id
 * Editar artículo existente
 * Body: campos a actualizar
 */
router.put('/articulos/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'UPDATE_ARTICULO', 
        tabla: 'articulos',
        incluirBody: true 
    }),
    inventarioController.editarArticulo
);

/**
 * DELETE /inventario/articulos/:id
 * Eliminar artículo (soft delete)
 */
router.delete('/articulos/:id',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'DELETE_ARTICULO',
        tabla: 'articulos'
    }),
    inventarioController.eliminarArticulo
);

// =====================================================
// RUTAS DE INGREDIENTES
// =====================================================

/**
 * GET /inventario/ingredientes
 * Listar ingredientes con filtros
 * Query params: nombre, disponible, limite, pagina
 */
router.get('/ingredientes',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'VIEW_INGREDIENTES',
        tabla: 'ingredientes',
        incluirQuery: true
    }),
    inventarioController.filtrarIngredientes
);

/**
 * GET /inventario/ingredientes/:id
 * Obtener ingrediente específico
 */
router.get('/ingredientes/:id',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'VIEW_INGREDIENTE',
        tabla: 'ingredientes'
    }),
    inventarioController.obtenerIngrediente
);

/**
 * POST /inventario/ingredientes
 * Crear nuevo ingrediente
 * Body: nombre, descripcion, precio_extra, disponible
 */
router.post('/ingredientes',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'CREATE_INGREDIENTE',
        tabla: 'ingredientes',
        incluirBody: true
    }),
    inventarioController.crearIngrediente
);

/**
 * PUT /inventario/ingredientes/:id
 * Editar ingrediente existente
 */
router.put('/ingredientes/:id',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'UPDATE_INGREDIENTE',
        tabla: 'ingredientes',
        incluirBody: true
    }),
    inventarioController.editarIngrediente
);

/**
 * DELETE /inventario/ingredientes/:id
 * Eliminar ingrediente
 */
router.delete('/ingredientes/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'DELETE_INGREDIENTE', 
        tabla: 'ingredientes' 
    }),
    inventarioController.eliminarIngrediente
);

// =====================================================
// RUTAS DE CONTENIDO DE ARTÍCULOS ELABORADOS
// =====================================================

/**
 * GET /inventario/articulos/:id/contenido
 * Obtener ingredientes de un artículo elaborado
 */
router.get('/articulos/:id/contenido', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_CONTENIDO_ARTICULO', 
        tabla: 'articulo_contenido' 
    }),
    inventarioController.obtenerContenidoArticulo
);

/**
 * POST /inventario/articulos/:id/contenido
 * Agregar ingrediente a artículo elaborado
 * Body: ingrediente_id, unidad_medida, cantidad
 */
router.post('/articulos/:id/contenido', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'ADD_INGREDIENTE_ARTICULO', 
        tabla: 'articulo_contenido',
        incluirBody: true 
    }),
    inventarioController.agregarIngredienteAArticulo
);

/**
 * PUT /inventario/articulos/:id/contenido/:ingrediente_id
 * Editar cantidad/unidad de ingrediente en artículo elaborado
 * Body: unidad_medida, cantidad
 */
router.put('/articulos/:id/contenido/:ingrediente_id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'UPDATE_CONTENIDO_ARTICULO', 
        tabla: 'articulo_contenido',
        incluirBody: true 
    }),
    inventarioController.editarContenidoArticulo
);

/**
 * DELETE /inventario/articulos/:id/contenido/:ingrediente_id
 * Eliminar ingrediente de artículo elaborado
 */
router.delete('/articulos/:id/contenido/:ingrediente_id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'DELETE_INGREDIENTE_ARTICULO', 
        tabla: 'articulo_contenido' 
    }),
    inventarioController.eliminarIngredienteDeArticulo
);

// =====================================================
// RUTAS DE CATEGORÍAS
// =====================================================

/**
 * GET /inventario/categorias
 * Listar categorías con filtros y paginación
 * Query params: nombre, limite, pagina
 */
router.get('/categorias', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_CATEGORIAS', 
        tabla: 'categorias',
        incluirQuery: true 
    }),
    inventarioController.filtrarCategorias
);

/**
 * GET /inventario/categorias/dropdown
 * Obtener categorías simples para dropdowns (sin paginación)
 */
router.get('/categorias/dropdown', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_CATEGORIAS_DROPDOWN', 
        tabla: 'categorias' 
    }),
    inventarioController.obtenerCategorias
);

/**
 * GET /inventario/categorias/:id
 * Obtener categoría específica
 */
router.get('/categorias/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_CATEGORIA', 
        tabla: 'categorias' 
    }),
    inventarioController.obtenerCategoria
);

/**
 * POST /inventario/categorias
 * Crear nueva categoría
 * Body: nombre, descripcion, orden
 */
router.post('/categorias', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'CREATE_CATEGORIA', 
        tabla: 'categorias',
        incluirBody: true 
    }),
    inventarioController.crearCategoria
);

/**
 * PUT /inventario/categorias/:id
 * Editar categoría existente
 * Body: nombre, descripcion, orden
 */
router.put('/categorias/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'UPDATE_CATEGORIA', 
        tabla: 'categorias',
        incluirBody: true 
    }),
    inventarioController.editarCategoria
);

/**
 * DELETE /inventario/categorias/:id
 * Eliminar categoría
 */
router.delete('/categorias/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'DELETE_CATEGORIA', 
        tabla: 'categorias' 
    }),
    inventarioController.eliminarCategoria
);

// =====================================================
// RUTAS AUXILIARES
// =====================================================

/**
 * GET /inventario/stock-bajo
 * Obtener artículos con stock bajo para alertas
 */
router.get('/stock-bajo', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'VIEW_STOCK_BAJO', 
        tabla: 'articulos' 
    }),
    inventarioController.obtenerStockBajo
);

/**
 * GET /inventario/articulos/:id/costo
 * Calcular costo de ingredientes de un artículo elaborado
 */
router.get('/articulos/:id/costo', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'CALC_COSTO_ELABORADO', 
        tabla: 'articulos' 
    }),
    inventarioController.calcularCostoElaborado
);



// =====================================================
// MIDDLEWARE DE VALIDACIÓN DE PARÁMETROS
// =====================================================

/**
 * Middleware para validar IDs numéricos
 */
const validarIdNumerico = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: `${paramName} debe ser un número válido`,
                receivedValue: id
            });
        }
        
        // Convertir a entero para uso posterior
        req.params[paramName] = parseInt(id);
        next();
    };
};

// Aplicar validación a rutas con parámetros ID
router.param('id', validarIdNumerico('id'));
router.param('ingrediente_id', validarIdNumerico('ingrediente_id'));

// =====================================================
// MIDDLEWARE DE MANEJO DE ERRORES ESPECÍFICO
// =====================================================

router.use((error, req, res, next) => {
    console.error('💥 Error en módulo de inventario:', {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        path: req.originalUrl,
        method: req.method,
        user: req.user?.usuario || 'DESCONOCIDO'
    });
    
    // Errores específicos del módulo
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Ya existe un registro con esos datos',
            code: 'DUPLICATE_ENTRY'
        });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            success: false,
            message: 'Referencia inválida - Verifica que los IDs existan',
            code: 'INVALID_REFERENCE'
        });
    }
    
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(400).json({
            success: false,
            message: 'No se puede eliminar - Registro está siendo usado',
            code: 'REFERENCED_ROW'
        });
    }
    
    // Error genérico
    res.status(error.status || 500).json({
        success: false,
        message: 'Error en módulo de inventario',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    });
});

module.exports = router;