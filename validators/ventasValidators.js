const { z } = require('zod');

// Schema para item de venta contenido
const ventaContenidoSchema = z.object({
    articulo_id: z.number().int().positive('El ID del artículo debe ser un número positivo'),
    articulo_nombre: z.string().min(1, 'El nombre del artículo es requerido').max(150),
    cantidad: z.number().int().positive('La cantidad debe ser mayor a 0'),
    precio: z.number().nonnegative('El precio debe ser mayor o igual a 0'),
    subtotal: z.number().nonnegative('El subtotal debe ser mayor o igual a 0')
});

// Schema para crear una nueva venta
const crearVentaSchema = z.object({
    cliente_nombre: z.string().min(1, 'El nombre del cliente es requerido').max(150).optional().nullable(),
    cliente_direccion: z.string().max(255).optional().nullable(),
    cliente_telefono: z.string().max(50).optional().nullable(),
    cliente_email: z.string().email('Email inválido').max(100).optional().nullable(),
    subtotal: z.number().nonnegative('El subtotal debe ser mayor o igual a 0'),
    iva_total: z.number().nonnegative('El IVA debe ser mayor o igual a 0').default(0),
    descuento: z.number().nonnegative('El descuento debe ser mayor o igual a 0').default(0),
    total: z.number().nonnegative('El total debe ser mayor o igual a 0'),
    medio_pago: z.string().max(50).default('EFECTIVO'),
    cuenta_id: z.number().int().positive().optional().nullable(),
    pedido_id: z.number().int().positive().optional().nullable(),
    estado: z.enum(['FACTURADA', 'ANULADA'], {
        errorMap: () => ({ message: 'Estado inválido' })
    }).default('FACTURADA'),
    observaciones: z.string().max(255).optional().nullable(),
    tipo_factura: z.string().length(1).optional().nullable(),
    articulos: z.array(ventaContenidoSchema).min(1, 'Debe incluir al menos un artículo')
});

// Schema para anular venta
const anularVentaSchema = z.object({
    motivo: z.string().min(1, 'El motivo de anulación es requerido').max(255).optional()
});

// Schema para ID de parámetro
const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'El ID debe ser un número').transform(Number)
});

// Middleware de validación genérico
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
    crearVentaSchema,
    anularVentaSchema,
    ventaContenidoSchema,
    idParamSchema,
    validate,
    validateParams
};












