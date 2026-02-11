const { z } = require('zod');

// =====================================================
// SCHEMAS PARA CUENTAS DE FONDOS
// =====================================================

// Schema para crear una cuenta de fondos
const crearCuentaSchema = z.object({
    nombre: z.string()
        .min(1, 'El nombre es obligatorio')
        .max(100, 'El nombre no puede exceder 100 caracteres'),
    descripcion: z.string()
        .max(255, 'La descripción no puede exceder 255 caracteres')
        .optional()
        .nullable(),
    saldo_inicial: z.number()
        .nonnegative('El saldo inicial no puede ser negativo')
        .max(999999999999.99, 'El saldo inicial excede el máximo permitido')
        .optional()
        .default(0)
});

// Schema para editar una cuenta de fondos
const editarCuentaSchema = z.object({
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
// SCHEMAS PARA MOVIMIENTOS DE FONDOS
// =====================================================

// Schema para registrar un movimiento manual
const registrarMovimientoSchema = z.object({
    cuenta_id: z.number().int().positive('El ID de cuenta debe ser un número positivo'),
    tipo: z.enum(['INGRESO', 'EGRESO'], {
        errorMap: () => ({ message: 'El tipo debe ser INGRESO o EGRESO' })
    }),
    monto: z.number()
        .positive('El monto debe ser mayor a 0')
        .max(999999999999.99, 'El monto excede el máximo permitido'),
    observaciones: z.string()
        .max(255, 'Las observaciones no pueden exceder 255 caracteres')
        .optional()
        .nullable()
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
    // Schemas de Cuentas
    crearCuentaSchema,
    editarCuentaSchema,
    
    // Schemas de Movimientos
    registrarMovimientoSchema,
    
    // Schemas de Parámetros
    idParamSchema,
    
    // Middlewares
    validate,
    validateParams
};

