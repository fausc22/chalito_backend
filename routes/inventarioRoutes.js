// routes/inventarioRoutes.js - Sistema Chalito
const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { middlewareAuditoria } = require('../middlewares/auditoriaMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

// ✅ Middleware para solo ADMIN y GERENTE
const soloAdminGerente = [authenticateToken, authorizeRole(['ADMIN', 'GERENTE'])];

// =====================================================
// DEPRECACIÓN RUTAS LEGACY DE ARTÍCULOS
// =====================================================
// Migración cerrada: todo lo de artículos vive en /articulos.
const responderRutaArticulosDeprecada = (req, res) => {
    return res.status(410).json({
        success: false,
        code: 'ARTICULOS_RUTA_DEPRECADA',
        message: 'Las rutas /inventario/articulos fueron deprecadas. Utilice /articulos.'
    });
};

router.get('/articulos', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.get('/articulos/:id', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.post('/articulos', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.put('/articulos/:id', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.delete('/articulos/:id', ...soloAdminGerente, responderRutaArticulosDeprecada);

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
 * Body: nombre, descripcion, disponible, unidad_base, costo_unitario_base
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

// Contenido de elaborados ahora se gestiona vía /articulos (controlador dedicado)
router.get('/articulos/:id/contenido', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.post('/articulos/:id/contenido', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.put('/articulos/:id/contenido/:ingrediente_id', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.delete('/articulos/:id/contenido/:ingrediente_id', ...soloAdminGerente, responderRutaArticulosDeprecada);

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
// RUTAS DE ADICIONALES
// =====================================================

/**
 * GET /inventario/adicionales
 * Listar adicionales con filtros
 * Query params: nombre, disponible, limite, pagina
 */
router.get('/adicionales',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'VIEW_ADICIONALES',
        tabla: 'adicionales',
        incluirQuery: true
    }),
    inventarioController.filtrarAdicionales
);

/**
 * GET /inventario/adicionales/:id
 * Obtener adicional específico
 */
router.get('/adicionales/:id',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'VIEW_ADICIONAL',
        tabla: 'adicionales'
    }),
    inventarioController.obtenerAdicional
);

/**
 * POST /inventario/adicionales
 * Crear nuevo adicional
 * Body: nombre, descripcion, precio_extra, disponible
 */
router.post('/adicionales',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'CREATE_ADICIONAL',
        tabla: 'adicionales',
        incluirBody: true
    }),
    inventarioController.crearAdicional
);

/**
 * PUT /inventario/adicionales/:id
 * Editar adicional existente
 */
router.put('/adicionales/:id',
    ...soloAdminGerente,
    middlewareAuditoria({
        accion: 'UPDATE_ADICIONAL',
        tabla: 'adicionales',
        incluirBody: true
    }),
    inventarioController.editarAdicional
);

/**
 * DELETE /inventario/adicionales/:id
 * Eliminar adicional
 */
router.delete('/adicionales/:id', 
    ...soloAdminGerente,
    middlewareAuditoria({ 
        accion: 'DELETE_ADICIONAL', 
        tabla: 'adicionales' 
    }),
    inventarioController.eliminarAdicional
);

// Adicionales por artículo migrados a /articulos/:id/adicionales
router.get('/articulos/:id/adicionales', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.post('/articulos/:id/adicionales', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.delete('/articulos/:id/adicionales/:adicionalId', ...soloAdminGerente, responderRutaArticulosDeprecada);

// =====================================================
// RUTAS AUXILIARES
// =====================================================

router.get('/stock-bajo', ...soloAdminGerente, responderRutaArticulosDeprecada);
router.get('/articulos/:id/costo', ...soloAdminGerente, responderRutaArticulosDeprecada);



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
router.param('adicionalId', validarIdNumerico('adicionalId'));

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