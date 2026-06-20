const {
    TEMPLATE_KEYS,
    REQUIRED_PLACEHOLDERS_ALL,
    REQUIRED_PLACEHOLDERS_TRANSFERENCIA,
    REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL,
} = require('./whatsappTemplateDefaults');

const MAX_TEMPLATE_LENGTH = 1500;
const HTML_PATTERN = /<[a-zA-Z][^>]*>/;

const isTransferenciaKey = (key) => String(key).startsWith('TRANSFERENCIA_');

const validateTemplate = (templateKey, templateText) => {
    const errors = [];
    const text = String(templateText ?? '');

    if (!text.trim()) {
        errors.push('La plantilla no puede estar vacía');
        return errors;
    }

    if (text.length > MAX_TEMPLATE_LENGTH) {
        errors.push(`La plantilla supera el máximo de ${MAX_TEMPLATE_LENGTH} caracteres`);
    }

    if (HTML_PATTERN.test(text)) {
        errors.push('La plantilla no puede contener HTML');
    }

    for (const placeholder of REQUIRED_PLACEHOLDERS_ALL) {
        if (!text.includes(placeholder)) {
            errors.push(`Falta el placeholder obligatorio ${placeholder}`);
        }
    }

    if (isTransferenciaKey(templateKey)) {
        for (const placeholder of REQUIRED_PLACEHOLDERS_TRANSFERENCIA) {
            if (!text.includes(placeholder)) {
                errors.push(`Falta el placeholder obligatorio ${placeholder}`);
            }
        }
    }

    return errors;
};

const isTemplateValid = (templateKey, templateText) =>
    validateTemplate(templateKey, templateText).length === 0;

const validatePlantillasPayload = (plantillas = {}) => {
    const errors = {};

    for (const [key, text] of Object.entries(plantillas)) {
        if (!TEMPLATE_KEYS.includes(key)) {
            errors[key] = [`Clave de plantilla desconocida: ${key}`];
            continue;
        }
        const keyErrors = validateTemplate(key, text);
        if (keyErrors.length > 0) {
            errors[key] = keyErrors;
        }
    }

    return errors;
};

const hasValidationErrors = (errors) => Object.keys(errors).length > 0;

const validateClienteLocalTemplate = (templateText) => {
    const errors = [];
    const text = String(templateText ?? '');

    if (!text.trim()) {
        errors.push('La plantilla no puede estar vacía');
        return errors;
    }

    if (text.length > MAX_TEMPLATE_LENGTH) {
        errors.push(`La plantilla supera el máximo de ${MAX_TEMPLATE_LENGTH} caracteres`);
    }

    if (HTML_PATTERN.test(text)) {
        errors.push('La plantilla no puede contener HTML');
    }

    for (const key of REQUIRED_PLACEHOLDERS_CLIENTE_AL_LOCAL) {
        if (!text.includes(`{{${key}}}`)) {
            errors.push(`Falta el placeholder obligatorio {{${key}}}`);
        }
    }

    return errors;
};

const isClienteLocalTemplateValid = (templateText) =>
    validateClienteLocalTemplate(templateText).length === 0;

const validatePlantillasClienteLocalPayload = (plantillas = {}) => {
    const errors = {};

    for (const [key, text] of Object.entries(plantillas)) {
        if (!TEMPLATE_KEYS.includes(key)) {
            errors[key] = [`Clave de plantilla desconocida: ${key}`];
            continue;
        }
        const keyErrors = validateClienteLocalTemplate(text);
        if (keyErrors.length > 0) {
            errors[key] = keyErrors;
        }
    }

    return errors;
};

module.exports = {
    MAX_TEMPLATE_LENGTH,
    validateTemplate,
    isTemplateValid,
    validatePlantillasPayload,
    validateClienteLocalTemplate,
    isClienteLocalTemplateValid,
    validatePlantillasClienteLocalPayload,
    hasValidationErrors,
};
