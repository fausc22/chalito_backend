/**
 * Validadores para pedidos desde carta pública (carta online)
 * POST /carta-publica/pedidos
 *
 * Campos de "cuando lo querés" (acepta alias para compatibilidad):
 * - when: "CUANTO_ANTES" | "HORA_PROGRAMADA" (oficial)
 * - scheduledTime / horarioEntrega / horario_entrega / deliveryTime (string "HH:MM" o ISO)
 */
const { z } = require('zod');

const montoAbonaInputSchema = z.union([z.string(), z.number()]).optional().nullable();

function parseMontoAbona(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = raw.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

const crearPedidoCartaSchema = z.object({
    customer: z.object({
        nombre: z.string().min(1, 'El nombre del cliente es requerido').max(150),
        telefono: z.string().min(1, 'El teléfono es requerido').max(50),
        email: z.string().email('Email inválido').max(100).optional().nullable()
    }),
    deliveryType: z.enum(['DELIVERY', 'RETIRO'], {
        errorMap: () => ({ message: 'deliveryType debe ser DELIVERY o RETIRO' })
    }),
    address: z.string().max(255).optional().nullable(),
    paymentMethod: z.string().min(1, 'El medio de pago es requerido').max(50),
    conCuantoAbona: montoAbonaInputSchema,
    cashGiven: montoAbonaInputSchema,
    notes: z.string().max(255).optional().nullable(),
    // Modalidad de entrega - acepta alias
    when: z.enum(['CUANTO_ANTES', 'HORA_PROGRAMADA']).optional(),
    scheduledTime: z.string().optional().nullable(),
    horarioEntrega: z.string().optional().nullable(),
    horario_entrega: z.string().optional().nullable(),
    deliveryTime: z.string().optional().nullable(),
    prioridad: z.enum(['NORMAL', 'ALTA']).optional(),
    items: z.array(z.object({
        productId: z.coerce.number().int().positive('productId debe ser un número positivo'),
        quantity: z.coerce.number().int().positive('La cantidad debe ser mayor a 0'),
        selectedExtras: z.array(z.coerce.number().int().nonnegative()).optional().default([]),
        itemNotes: z.string().max(255).optional().nullable()
    })).min(1, 'Debe incluir al menos un item')
}).superRefine((data, ctx) => {
    const paymentMethod = String(data.paymentMethod || '').trim().toUpperCase();
    if (paymentMethod !== 'EFECTIVO') {
        return;
    }

    const rawMonto = data.conCuantoAbona ?? data.cashGiven;
    const monto = parseMontoAbona(rawMonto);

    if (monto === null || monto <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conCuantoAbona'],
            message: 'Si el medio de pago es EFECTIVO, debés indicar un monto válido en conCuantoAbona/cashGiven.'
        });
    }
});

const validate = (schema) => (req, res, next) => {
    try {
        const parsed = schema.parse(req.body);
        req.validatedData = parsed;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            return res.status(400).json({
                success: false,
                message: 'Datos de validación inválidos',
                errors: messages
            });
        }
        next(error);
    }
};

module.exports = {
    crearPedidoCartaSchema,
    validate
};
