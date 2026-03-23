/**
 * Parser para horarios programados de pedidos.
 * Soporta: "HH:MM", "HH:mm", ISO datetime.
 * Si la hora ya pasó hoy, usa mañana.
 * Para HH:MM usa timezone del local si se pasa (America/Argentina/La_Pampa).
 */
const moment = require('moment-timezone');
const MIN_MINUTES_AHEAD = 10;
// La Pampa = UTC-3, mismo que Buenos_Aires (soporte en moment-timezone)
const STORE_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Parsea un valor de horario a Date.
 * @param {string} value - "HH:MM", "HH:mm", o ISO datetime
 * @param {Object} options - { useTomorrowIfPast: boolean, timezone: string }
 * @returns {{ date: Date, valid: boolean } | { error: string }}
 */
function parseScheduledTime(value, options = {}) {
    const { useTomorrowIfPast = true, timezone = STORE_TIMEZONE } = options;

    if (!value || typeof value !== 'string') {
        return { error: 'Horario no proporcionado' };
    }

    const trimmed = value.trim();
    if (!trimmed) return { error: 'Horario vacío' };

    let date = null;

    // ISO datetime (ej: 2026-03-04T18:30:00.000Z o 2026-03-04T15:30:00)
    if (trimmed.includes('T') || trimmed.includes('-') && trimmed.match(/^\d{4}-\d{2}-\d{2}/)) {
        date = new Date(trimmed);
        if (isNaN(date.getTime())) {
            return { error: 'Formato de fecha/hora inválido (ISO)' };
        }
    } else if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
        // HH:MM o H:MM - interpretar en timezone del local
        const [h, m] = trimmed.split(':').map(Number);
        if (h < 0 || h > 23 || m < 0 || m > 59) {
            return { error: 'Hora inválida (use HH:MM entre 00:00 y 23:59)' };
        }
        const now = moment().tz(timezone);
        let dateMoment = now.clone().hour(h).minute(m).second(0).millisecond(0);

        if (dateMoment.isSameOrBefore(now) && useTomorrowIfPast) {
            dateMoment = dateMoment.add(1, 'day');
        } else if (dateMoment.isSameOrBefore(now) && !useTomorrowIfPast) {
            return { error: 'La hora programada ya pasó hoy. Use mañana o un horario futuro.' };
        }
        date = dateMoment.toDate();
    } else {
        return { error: 'Formato no soportado. Use HH:MM (ej: 14:30) o ISO datetime.' };
    }

    const now = new Date();
    const minAhead = new Date(now.getTime() + MIN_MINUTES_AHEAD * 60 * 1000);
    if (date < minAhead) {
        return { error: `El horario debe ser al menos ${MIN_MINUTES_AHEAD} minutos en el futuro` };
    }

    return { date, valid: true };
}

module.exports = {
    parseScheduledTime,
    MIN_MINUTES_AHEAD
};
