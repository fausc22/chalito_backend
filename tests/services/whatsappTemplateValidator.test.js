const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateTemplate,
    isTemplateValid,
    validatePlantillasPayload,
    hasValidationErrors,
    MAX_TEMPLATE_LENGTH,
} = require('../../services/whatsappTemplateValidator');

const VALID_EFECTIVO = `Hola {{local}}

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Gracias!`;

const VALID_TRANSFERENCIA = `Hola {{local}}

Pedido #{{id}}

{{contenido}}

Total: {{total}}

Transferi a {{alias}}.`;

test('plantilla valida efectivo pasa validacion', () => {
    assert.equal(isTemplateValid('EFECTIVO_RETIRO', VALID_EFECTIVO), true);
    assert.equal(validateTemplate('EFECTIVO_RETIRO', VALID_EFECTIVO).length, 0);
});

test('plantilla sin {{id}} falla', () => {
    const errors = validateTemplate('EFECTIVO_RETIRO', 'Hola {{local}}\n{{contenido}}\n{{total}}');
    assert.ok(errors.some((e) => e.includes('{{id}}')));
});

test('plantilla sin {{contenido}} falla', () => {
    const errors = validateTemplate('EFECTIVO_RETIRO', 'Hola {{local}}\n#{{id}}\n{{total}}');
    assert.ok(errors.some((e) => e.includes('{{contenido}}')));
});

test('plantilla sin {{total}} falla', () => {
    const errors = validateTemplate('EFECTIVO_RETIRO', 'Hola {{local}}\n#{{id}}\n{{contenido}}');
    assert.ok(errors.some((e) => e.includes('{{total}}')));
});

test('transferencia sin {{alias}} falla', () => {
    const errors = validateTemplate('TRANSFERENCIA_RETIRO', VALID_EFECTIVO);
    assert.ok(errors.some((e) => e.includes('{{alias}}')));
});

test('transferencia con {{alias}} pasa', () => {
    assert.equal(isTemplateValid('TRANSFERENCIA_RETIRO', VALID_TRANSFERENCIA), true);
});

test('plantilla vacia falla', () => {
    const errors = validateTemplate('EFECTIVO_RETIRO', '   ');
    assert.ok(errors.some((e) => e.includes('vacía')));
});

test('plantilla con HTML falla', () => {
    const htmlTemplate = `${VALID_EFECTIVO}\n<b>bold</b>`;
    const errors = validateTemplate('EFECTIVO_RETIRO', htmlTemplate);
    assert.ok(errors.some((e) => e.includes('HTML')));
});

test('plantilla demasiado larga falla', () => {
    const longTemplate = `${VALID_EFECTIVO}${'x'.repeat(MAX_TEMPLATE_LENGTH)}`;
    const errors = validateTemplate('EFECTIVO_RETIRO', longTemplate);
    assert.ok(errors.some((e) => e.includes(String(MAX_TEMPLATE_LENGTH))));
});

test('validatePlantillasPayload agrupa errores por clave', () => {
    const errors = validatePlantillasPayload({
        EFECTIVO_RETIRO: 'invalida',
        TRANSFERENCIA_RETIRO: VALID_EFECTIVO,
        CLAVE_INVALIDA: 'test',
    });
    assert.ok(hasValidationErrors(errors));
    assert.ok(errors.EFECTIVO_RETIRO.length > 0);
    assert.ok(errors.TRANSFERENCIA_RETIRO.some((e) => e.includes('{{alias}}')));
    assert.ok(errors.CLAVE_INVALIDA);
});

test('validatePlantillasPayload vacio no tiene errores', () => {
    assert.equal(hasValidationErrors(validatePlantillasPayload({})), false);
});
