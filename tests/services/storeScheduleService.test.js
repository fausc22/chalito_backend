/**
 * Tests para storeScheduleService - validación de horarios de atención
 */
const moment = require('moment-timezone');
const {
    getStoreSchedule,
    getNowInStoreTimezone,
    isStoreOpen,
    isValidScheduledDateTime,
    getNextOpeningInfo,
    STORE_TIMEZONE
} = require('../../services/storeScheduleService');

const parseInTz = (str) => moment.tz(str, 'YYYY-MM-DD HH:mm', STORE_TIMEZONE);

describe('storeScheduleService', () => {
    describe('getStoreSchedule', () => {
        it('devuelve estructura con timezone y schedule', () => {
            const s = getStoreSchedule();
            expect(s.timezone).toBe(STORE_TIMEZONE);
            expect(s.toleranceMinutes).toBe(5);
            expect(s.schedule['3']).toEqual([[10, 0, 13, 5], [18, 0, 23, 5]]); // Miércoles con tolerancia
            expect(s.schedule['0']).toEqual([[17, 0, 23, 35]]); // Domingo 17-23:30 + 5min
        });
    });

    describe('getNowInStoreTimezone', () => {
        it('devuelve moment válido en La_Pampa', () => {
            const now = getNowInStoreTimezone();
            expect(now.isValid()).toBe(true);
            expect(now.format('Z')).toBeDefined();
        });
    });

    describe('isStoreOpen', () => {
        it('miércoles 11:00 La_Pampa => abierto', () => {
            const d = parseInTz('2026-03-04 11:00').toDate();
            expect(isStoreOpen(d)).toBe(true);
        });
        it('miércoles 14:00 La_Pampa => cerrado', () => {
            const d = parseInTz('2026-03-04 14:00').toDate();
            expect(isStoreOpen(d)).toBe(false);
        });
        it('miércoles 23:05 La_Pampa => abierto (tolerancia)', () => {
            const d = parseInTz('2026-03-04 23:05').toDate();
            expect(isStoreOpen(d)).toBe(true);
        });
        it('miércoles 23:06 La_Pampa => cerrado', () => {
            const d = parseInTz('2026-03-04 23:06').toDate();
            expect(isStoreOpen(d)).toBe(false);
        });
        it('lunes 12:00 La_Pampa => cerrado', () => {
            const d = parseInTz('2026-03-02 12:00').toDate();
            expect(isStoreOpen(d)).toBe(false);
        });
        it('domingo 18:00 La_Pampa => abierto', () => {
            const d = parseInTz('2026-03-08 18:00').toDate();
            expect(isStoreOpen(d)).toBe(true);
        });
        it('domingo 23:35 La_Pampa => abierto (tolerancia)', () => {
            const d = parseInTz('2026-03-08 23:35').toDate();
            expect(isStoreOpen(d)).toBe(true);
        });
    });

    describe('isValidScheduledDateTime', () => {
        it('domingo 18:00 => válido', () => {
            const d = parseInTz('2026-03-08 18:00').toDate();
            expect(isValidScheduledDateTime(d)).toBe(true);
        });
        it('domingo 15:30 => inválido (antes de apertura)', () => {
            const d = parseInTz('2026-03-08 15:30').toDate();
            expect(isValidScheduledDateTime(d)).toBe(false);
        });
        it('miércoles 18:30 => válido', () => {
            const d = parseInTz('2026-03-04 18:30').toDate();
            expect(isValidScheduledDateTime(d)).toBe(true);
        });
        it('miércoles 15:00 => inválido (entre franjas)', () => {
            const d = parseInTz('2026-03-04 15:00').toDate();
            expect(isValidScheduledDateTime(d)).toBe(false);
        });
        it('miércoles 23:05 => inválido para programado (sin tolerancia)', () => {
            const d = parseInTz('2026-03-04 23:05').toDate();
            expect(isValidScheduledDateTime(d)).toBe(false);
        });
        it('miércoles 23:00 => válido (cierre exacto)', () => {
            const d = parseInTz('2026-03-04 23:00').toDate();
            expect(isValidScheduledDateTime(d)).toBe(true);
        });
    });

    describe('getNextOpeningInfo', () => {
        it('domingo 16:00 => próxima apertura 17:00', () => {
            const d = parseInTz('2026-03-08 16:00');
            const info = getNextOpeningInfo(d);
            expect(info).not.toBeNull();
            expect(info.dayName).toBe('Domingo');
        });
        it('domingo 18:00 => ya abierto (null)', () => {
            const d = parseInTz('2026-03-08 18:00');
            const info = getNextOpeningInfo(d);
            expect(info).toBeNull();
        });
    });
});
