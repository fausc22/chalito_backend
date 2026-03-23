/**
 * Servicio de horarios de atención del local.
 * Timezone: America/Argentina/Buenos_Aires (UTC-3, equivalente a La Pampa).
 * Nota: moment-timezone no incluye America/Argentina/La_Pampa; Buenos_Aires es el mismo huso.
 *
 * Horarios:
 * - Miércoles: 10:00–13:00 y 18:00–23:00
 * - Jueves: 10:00–13:00 y 18:00–23:00
 * - Viernes: 10:00–13:00 y 17:00–23:30
 * - Sábado: 17:00–23:30
 * - Domingo: 17:00–23:30
 *
 * Tolerancia: 5 minutos después del cierre.
 */
const moment = require('moment-timezone');

// La Pampa usa UTC-3 (mismo que Buenos Aires). moment-timezone no incluye La_Pampa, usamos Buenos_Aires.
const STORE_TIMEZONE = 'America/Argentina/Buenos_Aires';
const TOLERANCE_MINUTES = 5;

/**
 * Estructura: día (0=domingo, 3=miércoles) -> array de franjas [startH, startM, endH, endM]
 * La tolerancia se aplica al end (endM += 5 si end es :00, o end = 23:35 si end es 23:30)
 */
const SCHEDULE_RAW = {
    0: [[17, 0, 23, 30]],           // Domingo: 17:00–23:30
    3: [[10, 0, 13, 0], [18, 0, 23, 0]],  // Miércoles
    4: [[10, 0, 13, 0], [18, 0, 23, 0]],  // Jueves
    5: [[10, 0, 13, 0], [17, 0, 23, 30]], // Viernes
    6: [[17, 0, 23, 30]]            // Sábado: 17:00–23:30
};
// Lunes (1) y Martes (2) cerrados

/**
 * Devuelve la estructura de días y franjas horarias.
 * Cada franja incluye la tolerancia aplicada al cierre.
 * @returns {Object} { timezone, toleranceMinutes, schedule: { dayOfWeek: [[startH, startM, endH, endM], ...] } }
 */
function getStoreSchedule() {
    const schedule = {};
    for (const [day, slots] of Object.entries(SCHEDULE_RAW)) {
        schedule[day] = slots.map(([sh, sm, eh, em]) => {
            let endM = em + TOLERANCE_MINUTES;
            let endH = eh;
            if (endM >= 60) {
                endM -= 60;
                endH += 1;
            }
            return [sh, sm, endH, endM];
        });
    }
    return {
        timezone: STORE_TIMEZONE,
        toleranceMinutes: TOLERANCE_MINUTES,
        schedule
    };
}

/**
 * Obtiene fecha/hora actual en timezone del local.
 * @returns {moment.Moment}
 */
function getNowInStoreTimezone() {
    return moment().tz(STORE_TIMEZONE);
}

/**
 * Verifica si una fecha/hora cae dentro de alguna franja abierta (incluyendo tolerancia).
 * @param {Date|moment.Moment} date - Fecha/hora a evaluar
 * @returns {boolean}
 */
function isStoreOpen(date) {
    const m = moment(date).tz(STORE_TIMEZONE);
    return isWithinOpenSlot(m);
}

/**
 * Valida si un horario programado cae dentro de una franja abierta válida.
 * No aplica tolerancia al programado: debe estar dentro del horario real.
 * @param {Date|moment.Moment} date - Fecha/hora programada
 * @returns {boolean}
 */
function isValidScheduledDateTime(date) {
    const m = moment(date).tz(STORE_TIMEZONE);
    return isWithinOpenSlot(m, false); // sin tolerancia para programados
}

/**
 * @param {moment.Moment} m - Momento en timezone del local
 * @param {boolean} useTolerance - Si true, aplica tolerancia al cierre
 */
function isWithinOpenSlot(m, useTolerance = true) {
    const day = m.day(); // 0=domingo, 3=miércoles, etc.
    const slots = SCHEDULE_RAW[day];
    if (!slots) return false;

    const hour = m.hour();
    const minute = m.minute();
    const timeMinutes = hour * 60 + minute;

    for (const [sh, sm, eh, em] of slots) {
        let endM = em;
        let endH = eh;
        if (useTolerance) {
            endM = em + TOLERANCE_MINUTES;
            endH = eh;
            if (endM >= 60) {
                endM -= 60;
                endH += 1;
            }
        }
        const startMinutes = sh * 60 + sm;
        const endMinutes = endH * 60 + endM;
        if (timeMinutes >= startMinutes && timeMinutes <= endMinutes) {
            return true;
        }
    }
    return false;
}

/**
 * Devuelve información de próxima apertura (útil para mensajes).
 * @param {Date|moment.Moment} date - Fecha desde la cual buscar
 * @returns {{ nextOpen: string|null, dayName: string|null, slots: string[]|null }}
 */
function getNextOpeningInfo(date) {
    const m = moment(date).tz(STORE_TIMEZONE);
    const day = m.day();

    for (let offset = 0; offset <= 7; offset++) {
        const checkDay = (day + offset) % 7;
        const slots = SCHEDULE_RAW[checkDay];
        if (!slots) continue;

        const checkDate = m.clone().add(offset, 'days');
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const slotStrs = slots.map(([sh, sm, eh, em]) =>
            `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}–${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
        );

        if (offset === 0) {
            const hour = m.hour();
            const minute = m.minute();
            const timeMinutes = hour * 60 + minute;
            for (const [sh, sm, eh, em] of slots) {
                const startMinutes = sh * 60 + sm;
                const endMinutes = (eh * 60 + em) + TOLERANCE_MINUTES;
                if (timeMinutes < startMinutes) {
                    return {
                        nextOpen: `${checkDate.format('DD/MM')} ${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
                        dayName: dayNames[checkDay],
                        slots: slotStrs
                    };
                }
                if (timeMinutes <= endMinutes) {
                    return null; // ya está abierto
                }
            }
        } else {
            return {
                nextOpen: `${checkDate.format('DD/MM')} ${slotStrs[0].split('–')[0]}`,
                dayName: dayNames[checkDay],
                slots: slotStrs
            };
        }
    }
    return { nextOpen: null, dayName: null, slots: null };
}

module.exports = {
    getStoreSchedule,
    getNowInStoreTimezone,
    isStoreOpen,
    isValidScheduledDateTime,
    getNextOpeningInfo,
    STORE_TIMEZONE,
    TOLERANCE_MINUTES
};
