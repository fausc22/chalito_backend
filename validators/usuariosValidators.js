const { z } = require('zod');
const { ROLES } = require('../config/permissions');

const rolEnum = z.enum([ROLES.ADMIN, ROLES.GERENTE, ROLES.CAJERO, ROLES.COCINA]);

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100),
  email: z.string().email().max(100),
  usuario: z.string().min(1).max(50),
  password: z.string().min(6).max(128),
  rol: rolEnum,
  avatar_key: z.string().max(50).nullable().optional(),
});

const editarUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  email: z.string().email().max(100).optional(),
  usuario: z.string().min(1).max(50).optional(),
  rol: rolEnum.optional(),
  avatar_key: z.string().max(50).nullable().optional(),
});

const patchActivoSchema = z.object({
  activo: z.boolean(),
});

const resetPasswordSchema = z.object({
  password_nueva: z.string().min(6).max(128),
  confirmar_password: z.string().min(6).max(128),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().max(100).optional(),
  rol: rolEnum.optional(),
  activo: z
    .enum(['0', '1', 'true', 'false', 'all'])
    .optional()
    .transform((v) => {
      if (v === undefined || v === 'all') return undefined;
      if (v === '1' || v === 'true') return 1;
      if (v === '0' || v === 'false') return 0;
      return undefined;
    }),
});

const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Error de validación',
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      req.validatedParams = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros inválidos',
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros de consulta inválidos',
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

module.exports = {
  crearUsuarioSchema,
  editarUsuarioSchema,
  patchActivoSchema,
  resetPasswordSchema,
  idParamSchema,
  listQuerySchema,
  validate,
  validateParams,
  validateQuery,
};
