const test = require('node:test');
const assert = require('node:assert/strict');
const {
    stripJidArtifacts,
    extractPhoneFromBaileysJid,
    normalizePhoneArgentina,
    normalizeWaMeNumber,
    isValidWhatsAppNumber,
    formatJidFromNumber,
} = require('../../services/whatsappPhoneUtils');

test('extractPhoneFromBaileysJid quita deviceId y dominio', () => {
    assert.equal(
        extractPhoneFromBaileysJid('5492302651250:19@s.whatsapp.net'),
        '5492302651250'
    );
    assert.equal(
        extractPhoneFromBaileysJid('5492302651250:20@s.whatsapp.net'),
        '5492302651250'
    );
    assert.equal(
        extractPhoneFromBaileysJid('5492302651250@s.whatsapp.net'),
        '5492302651250'
    );
});

test('stripJidArtifacts quita sufijos Baileys', () => {
    assert.equal(stripJidArtifacts('5492302651250:19'), '5492302651250');
    assert.equal(stripJidArtifacts('5492302651250@s.whatsapp.net'), '5492302651250');
});

test('normalizePhoneArgentina unifica formatos moviles AR', () => {
    assert.equal(normalizePhoneArgentina('2302651250'), '5492302651250');
    assert.equal(normalizePhoneArgentina('542302651250'), '5492302651250');
    assert.equal(normalizePhoneArgentina('5492302651250'), '5492302651250');
    assert.equal(
        normalizePhoneArgentina('5492302651250:19@s.whatsapp.net'),
        '5492302651250'
    );
});

test('normalizeWaMeNumber rechaza numeros corruptos post-bug', () => {
    assert.equal(normalizeWaMeNumber('5492302651250'), '5492302651250');
    assert.equal(normalizeWaMeNumber('2302633818'), '5492302633818');
    assert.equal(normalizeWaMeNumber('549230265125019'), null);
    assert.equal(normalizeWaMeNumber('5492302651250:19'), '5492302651250');
});

test('isValidWhatsAppNumber valida movil AR de 13 digitos', () => {
    assert.equal(isValidWhatsAppNumber('2302651250'), true);
    assert.equal(isValidWhatsAppNumber('123'), false);
    assert.equal(isValidWhatsAppNumber('549230265125019'), false);
});

test('formatJidFromNumber arma JID WhatsApp', () => {
    assert.equal(
        formatJidFromNumber('2302651250'),
        '5492302651250@s.whatsapp.net'
    );
});
