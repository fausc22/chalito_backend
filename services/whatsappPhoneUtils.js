const normalizeWaMeNumber = (raw) => {
    let digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('00')) {
        digits = digits.slice(2);
    }

    if (digits.length === 10 && /^[1-9]/.test(digits)) {
        digits = `54${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('9')) {
        digits = `54${digits}`;
    }

    if (digits.length < 10 || digits.length > 15) {
        return null;
    }

    return digits;
};

module.exports = {
    normalizeWaMeNumber,
};
