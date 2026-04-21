const { z } = require('zod');

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');
const sanitizeString = (value) => value.trim().replace(/\s+/g, ' ');

const booleanFromQuerySchema = z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
}, z.boolean());

const sanitizedNullableString = z
    .string()
    .transform(sanitizeString)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const idParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'El ID debe ser un numero').transform(Number)
});

const listarInsumosQuerySchema = z.object({
    incluir_inactivos: booleanFromQuerySchema.optional().default(false)
});

const crearInsumoSchema = z.object({
    nombre: z.string().transform(sanitizeString).pipe(z.string().min(1, 'nombre es obligatorio').max(150)),
    descripcion: sanitizedNullableString,
    activo: z.boolean().optional().default(true)
});

const editarInsumoSchema = z
    .object({
        nombre: z.string().transform(sanitizeString).pipe(z.string().min(1).max(150)).optional(),
        descripcion: sanitizedNullableString
    })
    .refine((data) => data.nombre !== undefined || data.descripcion !== undefined, {
        message: 'Debe enviar al menos nombre o descripcion',
        path: ['nombre']
    });

const patchActivoInsumoSchema = z.object({
    activo: z.boolean()
});

const crearSemanaSchema = z
    .object({
        fecha_inicio: fechaSchema,
        fecha_fin: fechaSchema,
        observaciones: sanitizedNullableString
    })
    .refine((data) => data.fecha_inicio <= data.fecha_fin, {
        message: 'fecha_inicio no puede ser mayor a fecha_fin',
        path: ['fecha_inicio']
    });

const queryEmptyToUndefined = (value) => (value === '' ? undefined : value);

/** Query string → entero acotado o undefined (defaults en transform / servicio). */
const queryIntInRange = (min, max) => (value) => {
    const v = queryEmptyToUndefined(value);
    if (v === undefined || v === null) return undefined;
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n)) return undefined;
    const t = Math.trunc(n);
    if (t < min || t > max) return undefined;
    return t;
};

const historicoSemanasQuerySchema = z
    .object({
        limite: z.preprocess(queryIntInRange(1, 100), z.number().int().optional()),
        limit: z.preprocess(queryIntInRange(1, 100), z.number().int().optional()),
        pagina: z.preprocess(queryIntInRange(1, Number.MAX_SAFE_INTEGER), z.number().int().optional()),
        page: z.preprocess(queryIntInRange(1, Number.MAX_SAFE_INTEGER), z.number().int().optional()),
        offset: z.preprocess(queryIntInRange(0, 10_000_000), z.number().int().optional()),
        estado: z.enum(['ABIERTA', 'CERRADA']).optional()
    })
    .transform((q) => ({
        limite: q.limite ?? q.limit ?? 20,
        pagina: q.pagina ?? q.page ?? 1,
        offset: q.offset,
        estado: q.estado
    }));

const stockInicialBodySchema = z
    .object({
        stock_inicial: z.number().int().positive('stock_inicial debe ser un entero mayor a 0').optional(),
        observaciones: sanitizedNullableString
    })
    .refine((data) => data.stock_inicial !== undefined || data.observaciones !== undefined, {
        message: 'Debe enviar stock_inicial u observaciones',
        path: ['stock_inicial']
    });

const stockFinalBodySchema = z
    .object({
        stock_final: z.number().int().nonnegative('stock_final debe ser un entero mayor o igual a 0').optional(),
        observaciones: sanitizedNullableString
    })
    .refine((data) => data.stock_final !== undefined || data.observaciones !== undefined, {
        message: 'Debe enviar stock_final u observaciones',
        path: ['stock_final']
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
    idParamSchema,
    listarInsumosQuerySchema,
    crearInsumoSchema,
    editarInsumoSchema,
    patchActivoInsumoSchema,
    crearSemanaSchema,
    historicoSemanasQuerySchema,
    stockInicialBodySchema,
    stockFinalBodySchema,
    validate,
    validateParams,
    validateQuery
};
