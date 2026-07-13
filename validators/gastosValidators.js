const { z } = require('zod');

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

const obtenerFechaHoyYYYYMMDD = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const fechaGastoOptionalSchema = fechaSchema
    .optional()
    .refine(
        (fecha) => !fecha || fecha <= obtenerFechaHoyYYYYMMDD(),
        { message: 'La fecha no puede ser futura' }
    );

// =====================================================
// SCHEMAS PARA GASTOS
// =====================================================

// Schema para crear un nuevo gasto
const crearGastoSchema = z.object({
    categoria_id: z.number().int().positive('El ID de categoría debe ser un número positivo'),
    descripcion: z.string()
        .max(255, 'La descripción no puede exceder 255 caracteres')
        .optional()
        .nullable(),
    monto: z.number()
        .positive('El monto debe ser mayor a 0')
        .max(99999999.99, 'El monto excede el máximo permitido'),
    forma_pago: z.string()
        .max(50, 'La forma de pago no puede exceder 50 caracteres')
        .optional()
        .nullable()
        .default('EFECTIVO'),
    observaciones: z.string()
        .max(255, 'Las observaciones no pueden exceder 255 caracteres')
        .optional()
        .nullable(),
    fecha: fechaGastoOptionalSchema
});

// Schema para editar un gasto
const editarGastoSchema = z.object({
    categoria_id: z.number().int().positive('El ID de categoría debe ser un número positivo').optional(),
    descripcion: z.string()
        .max(255, 'La descripción no puede exceder 255 caracteres')
        .optional()
        .nullable(),
    monto: z.number()
        .positive('El monto debe ser mayor a 0')
        .max(99999999.99, 'El monto excede el máximo permitido')
        .optional(),
    forma_pago: z.string()
        .max(50, 'La forma de pago no puede exceder 50 caracteres')
        .optional()
        .nullable(),
    observaciones: z.string()
        .max(255, 'Las observaciones no pueden exceder 255 caracteres')
        .optional()
        .nullable(),
    fecha: fechaGastoOptionalSchema
});

// =====================================================
// SCHEMAS PARA CATEGORÍAS DE GASTOS
// =====================================================

// Schema para crear categoría de gasto
const crearCategoriaGastoSchema = z.object({
    nombre: z.string()
        .min(1, 'El nombre es obligatorio')
        .max(100, 'El nombre no puede exceder 100 caracteres'),
    descripcion: z.string()
        .max(255, 'La descripción no puede exceder 255 caracteres')
        .optional()
        .nullable()
});

// Schema para editar categoría de gasto
const editarCategoriaGastoSchema = z.object({
    nombre: z.string()
        .min(1, 'El nombre es obligatorio')
        .max(100, 'El nombre no puede exceder 100 caracteres')
        .optional(),
    descripcion: z.string()
        .max(255, 'La descripción no puede exceder 255 caracteres')
        .optional()
        .nullable(),
    activa: z.boolean().optional()
});

// =====================================================
// SCHEMAS PARA PARÁMETROS
// =====================================================

// Schema para ID de parámetro
const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'El ID debe ser un número').transform(Number)
});

// =====================================================
// MIDDLEWARES DE VALIDACIÓN
// =====================================================

// Middleware de validación para body
const validate = (schema) => {
    return (req, res, next) => {
        try {
            const validatedData = schema.parse(req.body);
            req.validatedData = validatedData;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    message: 'Error de validación',
                    errors: error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};

// Middleware para validar parámetros de ruta
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            const validatedParams = schema.parse(req.params);
            req.validatedParams = validatedParams;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    message: 'Parámetros inválidos',
                    errors: error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};

module.exports = {
    // Schemas de Gastos
    crearGastoSchema,
    editarGastoSchema,
    
    // Schemas de Categorías
    crearCategoriaGastoSchema,
    editarCategoriaGastoSchema,
    
    // Schemas de Parámetros
    idParamSchema,
    
    // Middlewares
    validate,
    validateParams
};

