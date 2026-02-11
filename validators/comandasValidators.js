const { z } = require('zod');

// Schema para item de comanda contenido
const comandaContenidoSchema = z.object({
    articulo_id: z.number().int().positive('El ID del artículo debe ser un número positivo'),
    articulo_nombre: z.string().min(1, 'El nombre del artículo es requerido').max(150),
    cantidad: z.number().int().positive('La cantidad debe ser mayor a 0'),
    personalizaciones: z.record(z.any()).optional().nullable(),
    observaciones: z.string().max(255).optional().nullable()
});

// Schema para crear una nueva comanda
// NOTA: La comanda no maneja estado propio, el estado se deriva exclusivamente de pedidos.estado
const crearComandaSchema = z.object({
    pedido_id: z.number().int().positive('El ID del pedido es requerido'),
    cliente_nombre: z.string().min(1, 'El nombre del cliente es requerido').max(150).optional().nullable(),
    cliente_direccion: z.string().max(255).optional().nullable(),
    cliente_telefono: z.string().max(50).optional().nullable(),
    cliente_email: z.string().email('Email inválido').max(100).optional().nullable(),
    modalidad: z.enum(['DELIVERY', 'RETIRO'], {
        errorMap: () => ({ message: 'La modalidad debe ser DELIVERY o RETIRO' })
    }),
    horario_entrega: z.string().datetime().optional().nullable(),
    observaciones: z.string().max(255).optional().nullable(),
    articulos: z.array(comandaContenidoSchema).min(1, 'Debe incluir al menos un artículo')
});

// NOTA: No existe schema para actualizar estado de comanda porque la comanda no maneja estado propio.
// El estado se deriva exclusivamente de pedidos.estado

// Schema para actualizar observaciones de comanda
const actualizarObservacionesComandaSchema = z.object({
    observaciones: z.string().max(255).optional().nullable()
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
    crearComandaSchema,
    actualizarObservacionesComandaSchema,
    comandaContenidoSchema,
    idParamSchema,
    validate,
    validateParams
};

