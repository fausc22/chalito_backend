/**
 * Servicio de horarios de atención del local (fuente: BD horarios_tienda).
 * Timezone: America/Argentina/Buenos_Aires
 */
const moment = require('moment-timezone');
const horariosTiendaRepository = require('../repositories/horariosTiendaRepository');
const tiendaOnlineSettingsService = require('./tiendaOnlineSettingsService');

const STORE_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Fallback si BD vacía o error (schedule histórico hardcodeado) */
const FALLBACK_SCHEDULE_RAW = {
    0: [[17, 0, 23, 30]],
    3: [[10, 0, 13, 0], [18, 0, 23, 0]],
    4: [[10, 0, 13, 0], [18, 0, 23, 0]],
    5: [[10, 0, 13, 0], [17, 0, 23, 30]],
    6: [[17, 0, 23, 30]]
};

const CACHE_TTL_MS = 30_000;
let scheduleCache = null;
let scheduleCacheAt = 0;
let testScheduleOverride = null;

const parseTimeToParts = (timeValue) => {
    const text = String(timeValue || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
};

const rowsToScheduleRaw = (rows) => {
    const schedule = {};
    for (const row of rows) {
        if (!row.activo) continue;
        const openParts = parseTimeToParts(row.hora_apertura);
        const closeParts = parseTimeToParts(row.hora_cierre);
        if (!openParts || !closeParts) continue;
        const day = String(row.dia_semana);
        if (!schedule[day]) schedule[day] = [];
        schedule[day].push([openParts[0], openParts[1], closeParts[0], closeParts[1]]);
    }
    return schedule;
};

const loadScheduleRaw = async () => {
    if (testScheduleOverride) {
        return { ...testScheduleOverride };
    }

    const now = Date.now();
    if (scheduleCache && now - scheduleCacheAt < CACHE_TTL_MS) {
        return { ...scheduleCache };
    }

    try {
        const rows = await horariosTiendaRepository.findAll();
        const fromDb = rowsToScheduleRaw(rows);
        const hasSlots = Object.keys(fromDb).length > 0;
        scheduleCache = hasSlots ? fromDb : { ...FALLBACK_SCHEDULE_RAW };
        scheduleCacheAt = now;
        return { ...scheduleCache };
    } catch (error) {
        console.error('Error cargando horarios_tienda, usando fallback:', error.message);
        return { ...FALLBACK_SCHEDULE_RAW };
    }
};

const getToleranceMinutes = async () => {
    const settings = await tiendaOnlineSettingsService.getSettings();
    const tolerance = Number(settings.toleranceMinutes);
    return Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 5;
};

const applyToleranceToSlot = ([sh, sm, eh, em], toleranceMinutes) => {
    let endM = em + toleranceMinutes;
    let endH = eh;
    if (endM >= 60) {
        endM -= 60;
        endH += 1;
    }
    return [sh, sm, endH, endM];
};

const getStoreSchedule = async () => {
    const scheduleRaw = await loadScheduleRaw();
    const toleranceMinutes = await getToleranceMinutes();
    const schedule = {};

    for (const [day, slots] of Object.entries(scheduleRaw)) {
        schedule[day] = slots.map((slot) => applyToleranceToSlot(slot, toleranceMinutes));
    }

    return {
        timezone: STORE_TIMEZONE,
        toleranceMinutes,
        schedule
    };
};

function getNowInStoreTimezone() {
    return moment().tz(STORE_TIMEZONE);
}

const isWithinOpenSlotSync = (m, scheduleRaw, useTolerance, toleranceMinutes) => {
    const day = m.day();
    const slots = scheduleRaw[day];
    if (!slots || slots.length === 0) return false;

    const hour = m.hour();
    const minute = m.minute();
    const timeMinutes = hour * 60 + minute;

    for (const [sh, sm, eh, em] of slots) {
        const slot = useTolerance
            ? applyToleranceToSlot([sh, sm, eh, em], toleranceMinutes)
            : [sh, sm, eh, em];
        const startMinutes = slot[0] * 60 + slot[1];
        const endMinutes = slot[2] * 60 + slot[3];
        if (timeMinutes >= startMinutes && timeMinutes <= endMinutes) {
            return true;
        }
    }
    return false;
};

async function isStoreOpen(date) {
    const settings = await tiendaOnlineSettingsService.getSettings();
    if (!settings.validarHorarios) return true;

    const m = moment(date).tz(STORE_TIMEZONE);
    const scheduleRaw = await loadScheduleRaw();
    const toleranceMinutes = await getToleranceMinutes();
    return isWithinOpenSlotSync(m, scheduleRaw, true, toleranceMinutes);
}

async function isValidScheduledDateTime(date) {
    const settings = await tiendaOnlineSettingsService.getSettings();
    if (!settings.validarHorarios) return true;

    const m = moment(date).tz(STORE_TIMEZONE);
    const scheduleRaw = await loadScheduleRaw();
    return isWithinOpenSlotSync(m, scheduleRaw, false, 0);
}

function getNextOpeningInfoSync(m, scheduleRaw, toleranceMinutes) {
    const day = m.day();

    for (let offset = 0; offset <= 7; offset++) {
        const checkDay = (day + offset) % 7;
        const slots = scheduleRaw[checkDay];
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
                const endMinutes = (eh * 60 + em) + toleranceMinutes;
                if (timeMinutes < startMinutes) {
                    return {
                        nextOpen: `${checkDate.format('DD/MM')} ${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
                        dayName: dayNames[checkDay],
                        slots: slotStrs
                    };
                }
                if (timeMinutes <= endMinutes) {
                    return null;
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

async function getNextOpeningInfo(date) {
    const m = moment(date).tz(STORE_TIMEZONE);
    const scheduleRaw = await loadScheduleRaw();
    const toleranceMinutes = await getToleranceMinutes();
    return getNextOpeningInfoSync(m, scheduleRaw, toleranceMinutes);
}

async function getEstadoTienda(date = new Date()) {
    const settings = await tiendaOnlineSettingsService.getSettings();
    const toleranceMinutes = settings.toleranceMinutes ?? 5;
    const m = moment(date).tz(STORE_TIMEZONE);
    const scheduleRaw = await loadScheduleRaw();

    if (!settings.tiendaOnlineActiva) {
        return {
            tiendaOnlineActiva: false,
            validarHorarios: settings.validarHorarios,
            bloqueado: true,
            estaAbierto: false,
            mensaje: 'La tienda online está temporalmente inactiva.',
            nextOpeningText: null,
            razon: 'Tienda inactiva',
            timezone: STORE_TIMEZONE,
            toleranceMinutes
        };
    }

    if (!settings.validarHorarios) {
        return {
            tiendaOnlineActiva: true,
            validarHorarios: false,
            bloqueado: false,
            estaAbierto: true,
            mensaje: 'Estamos abiertos',
            nextOpeningText: null,
            razon: 'Validación horaria desactivada',
            timezone: STORE_TIMEZONE,
            toleranceMinutes
        };
    }

    const abierto = isWithinOpenSlotSync(m, scheduleRaw, true, toleranceMinutes);

    if (abierto) {
        return {
            tiendaOnlineActiva: true,
            validarHorarios: true,
            bloqueado: false,
            estaAbierto: true,
            mensaje: 'Estamos abiertos',
            nextOpeningText: null,
            razon: 'Dentro de horario',
            timezone: STORE_TIMEZONE,
            toleranceMinutes
        };
    }

    const nextInfo = getNextOpeningInfoSync(m, scheduleRaw, toleranceMinutes);
    const nextOpeningText = nextInfo?.nextOpen
        ? `Próxima apertura: ${nextInfo.nextOpen}`
        : null;

    return {
        tiendaOnlineActiva: true,
        validarHorarios: true,
        bloqueado: false,
        estaAbierto: false,
        mensaje: 'Estamos cerrados en este momento',
        nextOpeningText,
        razon: 'Fuera de horario',
        timezone: STORE_TIMEZONE,
        toleranceMinutes
    };
}

const invalidateScheduleCache = () => {
    scheduleCache = null;
    scheduleCacheAt = 0;
};

const setTestScheduleOverride = (scheduleRaw) => {
    testScheduleOverride = scheduleRaw;
    invalidateScheduleCache();
};

const clearTestScheduleOverride = () => {
    testScheduleOverride = null;
    invalidateScheduleCache();
};

/** Sync helpers for tests using override */
const getStoreScheduleSync = (scheduleRaw, toleranceMinutes = 5) => {
    const schedule = {};
    for (const [day, slots] of Object.entries(scheduleRaw)) {
        schedule[day] = slots.map((slot) => applyToleranceToSlot(slot, toleranceMinutes));
    }
    return { timezone: STORE_TIMEZONE, toleranceMinutes, schedule };
};

const isStoreOpenSync = (date, scheduleRaw, toleranceMinutes = 5, validate = true) => {
    if (!validate) return true;
    const m = moment(date).tz(STORE_TIMEZONE);
    return isWithinOpenSlotSync(m, scheduleRaw, true, toleranceMinutes);
};

const isValidScheduledDateTimeSync = (date, scheduleRaw, validate = true) => {
    if (!validate) return true;
    const m = moment(date).tz(STORE_TIMEZONE);
    return isWithinOpenSlotSync(m, scheduleRaw, false, 0);
};

module.exports = {
    getStoreSchedule,
    getNowInStoreTimezone,
    isStoreOpen,
    isValidScheduledDateTime,
    getNextOpeningInfo,
    getEstadoTienda,
    invalidateScheduleCache,
    setTestScheduleOverride,
    clearTestScheduleOverride,
    setTestSettingsOverride: tiendaOnlineSettingsService.setTestSettingsOverride,
    clearTestSettingsOverride: tiendaOnlineSettingsService.clearTestSettingsOverride,
    getStoreScheduleSync,
    isStoreOpenSync,
    isValidScheduledDateTimeSync,
    getNextOpeningInfoSync,
    FALLBACK_SCHEDULE_RAW,
    STORE_TIMEZONE,
    TOLERANCE_MINUTES: 5,
    loadScheduleRaw
};
