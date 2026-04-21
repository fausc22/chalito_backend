const { z } = require('zod');

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');
const sanitizeString = (value) => value.trim().replace(/\s+/g, ' ');
const booleanFromQuerySchema = z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'si', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
}, z.boolean());
const sanitizedNullableString = z
    .string()
    .transform(sanitizeString)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const crearEmpleadoSchema = z.object({
    nombre: z.string().transform(sanitizeString).pipe(z.string().min(1, 'El nombre es obligatorio').max(100)),
    apellido: z.string().transform(sanitizeString).pipe(z.string().min(1, 'El apellido es obligatorio').max(100)),
    telefono: sanitizedNullableString,
    email: sanitizedNullableString.refine(
        (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        'Email invalido'
    ),
    documento: sanitizedNullableString,
    activo: z.boolean().optional().default(true),
    valor_hora: z.number().positive('valor_hora debe ser mayor a 0'),
    fecha_ingreso: fechaSchema,
    observaciones: sanitizedNullableString
});

const editarEmpleadoSchema = z.object({
    nombre: z.string().transform(sanitizeString).pipe(z.string().min(1, 'El nombre es obligatorio').max(100)).optional(),
    apellido: z.string().transform(sanitizeString).pipe(z.string().min(1, 'El apellido es obligatorio').max(100)).optional(),
    telefono: sanitizedNullableString,
    email: sanitizedNullableString.refine(
        (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        'Email invalido'
    ),
    documento: sanitizedNullableString,
    valor_hora: z.number().positive('valor_hora debe ser mayor a 0'),
    fecha_ingreso: fechaSchema.optional(),
    observaciones: sanitizedNullableString
});

const actualizarEstadoEmpleadoSchema = z.object({
    activo: z.boolean()
});

const registrarIngresoAsistenciaSchema = z.object({
    empleado_id: z.number().int().positive('empleado_id debe ser un numero positivo')
});

const registrarEgresoAsistenciaSchema = z.object({
    empleado_id: z.number().int().positive('empleado_id debe ser un numero positivo')
});

const corregirAsistenciaSchema = z
    .object({
        hora_ingreso: z.string().datetime('hora_ingreso debe tener formato ISO'),
        hora_egreso: z.string().datetime('hora_egreso debe tener formato ISO'),
        observaciones: sanitizedNullableString,
        motivo_correccion: z.string().transform(sanitizeString).pipe(z.string().min(1, 'motivo_correccion es obligatorio'))
    })
    .refine((data) => new Date(data.hora_egreso).getTime() > new Date(data.hora_ingreso).getTime(), {
        message: 'hora_egreso debe ser mayor a hora_ingreso',
        path: ['hora_egreso']
    });

const crearMovimientoSchema = z.object({
    empleado_id: z.number().int().positive('empleado_id debe ser un numero positivo'),
    fecha: fechaSchema,
    tipo: z.enum(['ADELANTO', 'DESCUENTO', 'BONO', 'CONSUMO']),
    monto: z.number().positive('monto debe ser mayor a 0'),
    descripcion: z
        .string()
        .transform(sanitizeString)
        .pipe(z.string().min(1, 'descripcion es obligatoria'))
        .pipe(z.string().max(255, 'descripcion no puede superar 255 caracteres')),
    observaciones: sanitizedNullableString
});

const editarMovimientoSchema = z
    .object({
        empleado_id: z.number().int().positive('empleado_id debe ser un numero positivo').optional(),
        fecha: fechaSchema.optional(),
        tipo: z.enum(['ADELANTO', 'DESCUENTO', 'BONO', 'CONSUMO']).optional(),
        monto: z.number().positive('monto debe ser mayor a 0').optional(),
        descripcion: z
            .string()
            .transform(sanitizeString)
            .pipe(z.string().min(1, 'descripcion no puede estar vacia'))
            .pipe(z.string().max(255, 'descripcion no puede superar 255 caracteres'))
            .optional(),
        observaciones: sanitizedNullableString
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        'Debe enviar al menos un campo para actualizar'
    );

const montoLiquidacionGuardadoSchema = z.preprocess(
    (raw) => {
        if (raw === null || raw === undefined || raw === '') return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : raw;
    },
    z.number().finite().nonnegative().optional()
);

const montosLiquidacionGuardadoKeys = [
    'total_base',
    'total_bonos',
    'total_descuentos',
    'total_adelantos',
    'total_consumos'
];

const guardarLiquidacionSchema = z
    .object({
        empleado_id: z.number().int().positive('empleado_id debe ser un numero positivo'),
        fecha_desde: fechaSchema,
        fecha_hasta: fechaSchema,
        observaciones: sanitizedNullableString,
        total_base: montoLiquidacionGuardadoSchema,
        total_bonos: montoLiquidacionGuardadoSchema,
        total_descuentos: montoLiquidacionGuardadoSchema,
        total_adelantos: montoLiquidacionGuardadoSchema,
        total_consumos: montoLiquidacionGuardadoSchema
    })
    .refine((data) => data.fecha_desde <= data.fecha_hasta, 'fecha_desde no puede ser mayor a fecha_hasta')
    .superRefine((data, ctx) => {
        const presencia = montosLiquidacionGuardadoKeys.map((k) => data[k] !== undefined && data[k] !== null);
        const alguno = presencia.some(Boolean);
        const todos = presencia.every(Boolean);
        if (alguno && !todos) {
            montosLiquidacionGuardadoKeys.forEach((k, i) => {
                if (!presencia[i]) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message:
                            'Si envia totales de liquidacion, debe enviar total_base, total_bonos, total_descuentos, total_adelantos y total_consumos',
                        path: [k]
                    });
                }
            });
        }
    });

const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'El ID debe ser un numero').transform(Number)
});

const filtrosEmpleadosQuerySchema = z.object({
    activo: booleanFromQuerySchema.optional()
});

const filtrosAsistenciasQuerySchema = z
    .object({
        empleado_id: z.coerce.number().int().positive('empleado_id debe ser un numero positivo').optional(),
        fecha_desde: fechaSchema.optional(),
        fecha_hasta: fechaSchema.optional(),
        estado: z.enum(['ABIERTO', 'CERRADO', 'CORREGIDO', 'ANULADO']).optional()
    })
    .refine(
        (data) => !data.fecha_desde || !data.fecha_hasta || data.fecha_desde <= data.fecha_hasta,
        {
            message: 'fecha_desde no puede ser mayor a fecha_hasta',
            path: ['fecha_desde']
        }
    );

const filtrosMovimientosQuerySchema = z
    .object({
        empleado_id: z.coerce.number().int().positive('empleado_id debe ser un numero positivo').optional(),
        tipo: z.preprocess(
            (value) => (value === undefined ? undefined : String(value).trim().toUpperCase()),
            z.enum(['ADELANTO', 'DESCUENTO', 'BONO', 'CONSUMO']).optional()
        ),
        fecha_desde: fechaSchema.optional(),
        fecha_hasta: fechaSchema.optional()
    })
    .refine(
        (data) => !data.fecha_desde || !data.fecha_hasta || data.fecha_desde <= data.fecha_hasta,
        {
            message: 'fecha_desde no puede ser mayor a fecha_hasta',
            path: ['fecha_desde']
        }
    );

const filtrosLiquidacionesQuerySchema = z
    .object({
        empleado_id: z.coerce.number().int().positive('empleado_id debe ser un numero positivo').optional(),
        fecha_desde: fechaSchema.optional(),
        fecha_hasta: fechaSchema.optional(),
        estado: z.enum(['BORRADOR', 'CERRADA', 'PAGADA', 'ANULADA']).optional()
    })
    .refine(
        (data) => !data.fecha_desde || !data.fecha_hasta || data.fecha_desde <= data.fecha_hasta,
        {
            message: 'fecha_desde no puede ser mayor a fecha_hasta',
            path: ['fecha_desde']
        }
    );

const resumenLiquidacionQuerySchema = z
    .object({
        empleado_id: z.coerce.number().int().positive('empleado_id debe ser un numero positivo'),
        fecha_desde: fechaSchema,
        fecha_hasta: fechaSchema,
        incluir_detalle: booleanFromQuerySchema.optional().default(false)
    })
    .refine((data) => data.fecha_desde <= data.fecha_hasta, {
        message: 'fecha_desde no puede ser mayor a fecha_hasta',
        path: ['fecha_desde']
    });

const resumenLiquidacionBodySchema = z
    .object({
        empleado_id: z.coerce.number().int().positive('empleado_id debe ser un numero positivo'),
        fecha_desde: fechaSchema,
        fecha_hasta: fechaSchema,
        incluir_detalle: booleanFromQuerySchema.optional().default(false)
    })
    .refine((data) => data.fecha_desde <= data.fecha_hasta, {
        message: 'fecha_desde no puede ser mayor a fecha_hasta',
        path: ['fecha_desde']
    });

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
                    message: 'Error de validacion',
                    errors: error.errors.map((err) => ({
                        path: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};

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
                    message: 'Parametros invalidos',
                    errors: error.errors.map((err) => ({
                        path: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};

const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const validatedQuery = schema.parse(req.query);
            req.validatedQuery = validatedQuery;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    message: 'Query params invalidos',
                    errors: error.errors.map((err) => ({
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
    crearEmpleadoSchema,
    editarEmpleadoSchema,
    actualizarEstadoEmpleadoSchema,
    registrarIngresoAsistenciaSchema,
    registrarEgresoAsistenciaSchema,
    corregirAsistenciaSchema,
    crearMovimientoSchema,
    editarMovimientoSchema,
    guardarLiquidacionSchema,
    idParamSchema,
    filtrosEmpleadosQuerySchema,
    filtrosAsistenciasQuerySchema,
    filtrosMovimientosQuerySchema,
    filtrosLiquidacionesQuerySchema,
    resumenLiquidacionQuerySchema,
    resumenLiquidacionBodySchema,
    validate,
    validateParams,
    validateQuery
};
