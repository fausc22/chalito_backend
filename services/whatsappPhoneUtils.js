const { jidDecode } = require('@whiskeysockets/baileys');

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
const AR_MOBILE_LENGTH = 13;

const stripJidArtifacts = (raw) => {
    let value = String(raw ?? '').trim();
    if (!value) return '';

    const atIdx = value.indexOf('@');
    if (atIdx >= 0) {
        value = value.slice(0, atIdx);
    }

    const colonIdx = value.indexOf(':');
    if (colonIdx >= 0) {
        value = value.slice(0, colonIdx);
    }

    return value;
};

const extractPhoneFromBaileysJid = (jid) => {
    const trimmed = String(jid ?? '').trim();
    if (!trimmed) return null;

    const decoded = jidDecode(trimmed);
    if (decoded?.user) {
        return decoded.user;
    }

    const stripped = stripJidArtifacts(trimmed);
    const digits = stripped.replace(/\D/g, '');
    return digits || null;
};

const normalizePhoneArgentina = (raw) => {
    let digits = stripJidArtifacts(raw).replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('00')) {
        digits = digits.slice(2);
    }

    if (digits.startsWith('549') && digits.length >= 12) return digits;
    if (digits.startsWith('54') && digits.length >= 11) return `549${digits.slice(2)}`;
    if (digits.startsWith('9') && digits.length >= 11) return `54${digits}`;
    if (digits.startsWith('0') && digits.length >= 10) return `549${digits.slice(1)}`;
    if (digits.length === 10) return `549${digits}`;

    return digits;
};

const normalizeWaMeNumber = (raw) => {
    const normalized = normalizePhoneArgentina(raw);
    if (!normalized) return null;

    if (normalized.length < MIN_PHONE_DIGITS || normalized.length > MAX_PHONE_DIGITS) {
        return null;
    }

    if (normalized.startsWith('549') && normalized.length !== AR_MOBILE_LENGTH) {
        return null;
    }

    return normalized;
};

const isValidWhatsAppNumber = (raw) => normalizeWaMeNumber(raw) !== null;

const formatJidFromNumber = (number) => {
    const normalized = normalizePhoneArgentina(number);
    if (!normalized) return '';
    return `${normalized}@s.whatsapp.net`;
};

module.exports = {
    stripJidArtifacts,
    extractPhoneFromBaileysJid,
    normalizePhoneArgentina,
    normalizeWaMeNumber,
    isValidWhatsAppNumber,
    formatJidFromNumber,
    MIN_PHONE_DIGITS,
    MAX_PHONE_DIGITS,
    AR_MOBILE_LENGTH,
};
