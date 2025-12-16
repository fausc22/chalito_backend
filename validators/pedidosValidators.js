const { z } = require('zod');

// Schema para personalizaciones (JSON)
// Acepta objeto, null o undefined
const personalizacionesSchema = z.record(z.any()).optional().nullable();

// Schema para item de pedido contenido
const pedidoContenidoSchema = z.object({
    articulo_id: z.number().int().positive('El ID del artículo debe ser un número positivo'),
    articulo_nombre: z.string().min(1, 'El nombre del artículo es requerido').max(150),
    cantidad: z.number().int().positive('La cantidad debe ser mayor a 0'),
    precio: z.number().nonnegative('El precio debe ser mayor o igual a 0'),
    subtotal: z.number().nonnegative('El subtotal debe ser mayor o igual a 0'),
    personalizaciones: personalizacionesSchema,
    observaciones: z.string().max(255).optional().nullable()
});

// Schema para crear un nuevo pedido
const crearPedidoSchema = z.object({
    cliente_nombre: z.string().min(1, 'El nombre del cliente es requerido').max(150).optional().nullable(),
    cliente_direccion: z.string().max(255).optional().nullable(),
    cliente_telefono: z.string().max(50).optional().nullable(),
    cliente_email: z.string().email('Email inválido').max(100).optional().nullable(),
    origen_pedido: z.enum(['MOSTRADOR', 'TELEFONO', 'WHATSAPP', 'WEB'], {
        errorMap: () => ({ message: 'Origen de pedido inválido. Los valores permitidos son: MOSTRADOR, TELEFONO, WHATSAPP, WEB' })
    }).default('MOSTRADOR'),
    subtotal: z.number().nonnegative('El subtotal debe ser mayor o igual a 0').default(0),
    iva_total: z.number().nonnegative('El IVA debe ser mayor o igual a 0').default(0),
    total: z.number().nonnegative('El total debe ser mayor o igual a 0'),
    medio_pago: z.string().max(50).optional().nullable(),
    estado_pago: z.enum(['DEBE', 'PAGADO'], {
        errorMap: () => ({ message: 'Estado de pago inválido. Los valores permitidos son: DEBE, PAGADO' })
    }).default('DEBE'),
    modalidad: z.enum(['DELIVERY', 'RETIRO'], {
        errorMap: () => ({ message: 'La modalidad debe ser DELIVERY o RETIRO' })
    }),
    horario_entrega: z.string().datetime().optional().nullable(),
    estado: z.enum(['RECIBIDO', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO'], {
        errorMap: () => ({ message: 'Estado inválido. Los estados permitidos son: RECIBIDO, EN_PREPARACION, ENTREGADO, CANCELADO' })
    }).default('RECIBIDO'),
    observaciones: z.string().max(255).optional().nullable(),
    articulos: z.array(pedidoContenidoSchema).min(1, 'Debe incluir al menos un artículo')
});

// Schema para actualizar estado de pedido
// Estados según la tabla pedidos en BD: RECIBIDO, EN_PREPARACION, ENTREGADO, CANCELADO
const actualizarEstadoPedidoSchema = z.object({
    estado: z.enum(['RECIBIDO', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO'], {
        errorMap: () => ({ message: 'Estado inválido. Los estados permitidos son: RECIBIDO, EN_PREPARACION, ENTREGADO, CANCELADO' })
    })
});

// Schema para actualizar observaciones
const actualizarObservacionesSchema = z.object({
    observaciones: z.string().max(255).optional().nullable()
});

// Schema para agregar artículo a pedido existente
const agregarArticuloSchema = pedidoContenidoSchema;

// Schema para actualizar artículo en pedido
const actualizarArticuloPedidoSchema = z.object({
    cantidad: z.number().int().positive('La cantidad debe ser mayor a 0').optional(),
    precio: z.number().nonnegative('El precio debe ser mayor o igual a 0').optional(),
    subtotal: z.number().nonnegative('El subtotal debe ser mayor o igual a 0').optional(),
    personalizaciones: personalizacionesSchema,
    observaciones: z.string().max(255).optional().nullable()
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

// Schema para ID de parámetro
const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'El ID debe ser un número').transform(Number)
});

module.exports = {
    crearPedidoSchema,
    actualizarEstadoPedidoSchema,
    actualizarObservacionesSchema,
    agregarArticuloSchema,
    actualizarArticuloPedidoSchema,
    pedidoContenidoSchema,
    idParamSchema,
    validate,
    validateParams
};


