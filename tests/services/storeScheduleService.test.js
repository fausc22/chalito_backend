/**
 * Tests para storeScheduleService - validación de horarios de atención
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const moment = require('moment-timezone');
const {
    getStoreScheduleSync,
    getNowInStoreTimezone,
    isStoreOpenSync,
    isValidScheduledDateTimeSync,
    getEstadoTienda,
    FALLBACK_SCHEDULE_RAW,
    STORE_TIMEZONE,
    setTestScheduleOverride,
    clearTestScheduleOverride,
    setTestSettingsOverride,
    clearTestSettingsOverride
} = require('../../services/storeScheduleService');

const parseInTz = (str) => moment.tz(str, 'YYYY-MM-DD HH:mm', STORE_TIMEZONE);
const SCHEDULE = FALLBACK_SCHEDULE_RAW;

test.before(() => {
    setTestScheduleOverride(SCHEDULE);
    setTestSettingsOverride({
        tiendaOnlineActiva: true,
        validarHorarios: true,
        toleranceMinutes: 5
    });
});

test.after(() => {
    clearTestScheduleOverride();
    clearTestSettingsOverride();
});

test('getStoreScheduleSync devuelve estructura con timezone y schedule', () => {
    const s = getStoreScheduleSync(SCHEDULE, 5);
    assert.equal(s.timezone, STORE_TIMEZONE);
    assert.equal(s.toleranceMinutes, 5);
    assert.deepEqual(s.schedule['3'], [[10, 0, 13, 5], [18, 0, 23, 5]]);
    assert.deepEqual(s.schedule['0'], [[17, 0, 23, 35]]);
});

test('getNowInStoreTimezone devuelve moment válido', () => {
    const now = getNowInStoreTimezone();
    assert.equal(now.isValid(), true);
});

test('miércoles 11:00 => abierto', () => {
    const d = parseInTz('2026-03-04 11:00').toDate();
    assert.equal(isStoreOpenSync(d, SCHEDULE, 5, true), true);
});

test('miércoles 14:00 => cerrado', () => {
    const d = parseInTz('2026-03-04 14:00').toDate();
    assert.equal(isStoreOpenSync(d, SCHEDULE, 5, true), false);
});

test('getEstadoTienda: tienda inactiva => bloqueado', async () => {
    setTestSettingsOverride({
        tiendaOnlineActiva: false,
        validarHorarios: true,
        toleranceMinutes: 5
    });
    const estado = await getEstadoTienda(parseInTz('2026-03-04 11:00').toDate());
    assert.equal(estado.bloqueado, true);
    assert.equal(estado.estaAbierto, false);
    setTestSettingsOverride({
        tiendaOnlineActiva: true,
        validarHorarios: true,
        toleranceMinutes: 5
    });
});

test('getEstadoTienda: validación OFF => siempre abierto', async () => {
    setTestSettingsOverride({
        tiendaOnlineActiva: true,
        validarHorarios: false,
        toleranceMinutes: 5
    });
    const estado = await getEstadoTienda(parseInTz('2026-03-02 12:00').toDate());
    assert.equal(estado.estaAbierto, true);
    assert.equal(estado.validarHorarios, false);
    setTestSettingsOverride({
        tiendaOnlineActiva: true,
        validarHorarios: true,
        toleranceMinutes: 5
    });
});

test('getEstadoTienda: dentro de horario => abierto', async () => {
    const estado = await getEstadoTienda(parseInTz('2026-03-04 11:00').toDate());
    assert.equal(estado.estaAbierto, true);
    assert.equal(estado.bloqueado, false);
});
