/**
 * Tests de reglas de asistencia de empleados (fechas, turnos nocturnos y ventana manual).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const moment = require('moment-timezone');
const {
    validarVentanaFechaManual,
    obtenerFechaMinimaRegistroManual,
    obtenerFechaLocalActual,
    obtenerFechaLocalDesdeDatetime,
    requiereHoraEgresoExplicita,
    esTurnoActivoNocturno,
    HORAS_MAX_TURNO_ACTIVO,
    STORE_TIMEZONE,
} = require('../../services/EmpleadosService');

test('STORE_TIMEZONE es America/Argentina/Buenos_Aires', () => {
    assert.equal(STORE_TIMEZONE, 'America/Argentina/Buenos_Aires');
});

test('HORAS_MAX_TURNO_ACTIVO es 16', () => {
    assert.equal(HORAS_MAX_TURNO_ACTIVO, 16);
});

test('obtenerFechaLocalDesdeDatetime respeta dia calendario en Argentina', () => {
    const iso = moment.tz('2026-07-05 22:30:00', 'YYYY-MM-DD HH:mm:ss', STORE_TIMEZONE).toISOString();
    const fecha = obtenerFechaLocalDesdeDatetime(iso);
    assert.equal(fecha, '2026-07-05');
});

test('obtenerFechaMinimaRegistroManual no es posterior a hoy', () => {
    const minima = obtenerFechaMinimaRegistroManual();
    const hoy = obtenerFechaLocalActual();
    assert.ok(minima <= hoy, `minima ${minima} debe ser <= hoy ${hoy}`);
});

test('validarVentanaFechaManual acepta hoy', () => {
    const hoy = obtenerFechaLocalActual();
    const validada = validarVentanaFechaManual(hoy);
    assert.equal(validada, hoy);
});

test('validarVentanaFechaManual rechaza fecha futura', () => {
    const futuro = moment.tz(STORE_TIMEZONE).add(2, 'days').format('YYYY-MM-DD');
    assert.throws(
        () => validarVentanaFechaManual(futuro),
        (error) => error.code === 'FECHA_FUERA_DE_VENTANA'
    );
});

test('validarVentanaFechaManual rechaza fecha anterior a la ventana', () => {
    const minima = obtenerFechaMinimaRegistroManual();
    const anterior = moment.tz(minima, 'YYYY-MM-DD', STORE_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
    assert.throws(
        () => validarVentanaFechaManual(anterior),
        (error) => error.code === 'FECHA_FUERA_DE_VENTANA'
    );
});

test('validarVentanaFechaManual rechaza fecha invalida', () => {
    assert.throws(
        () => validarVentanaFechaManual('no-es-fecha'),
        (error) => error.code === 'FECHA_INVALIDA'
    );
});

test('esTurnoActivoNocturno retorna true para ingreso hace 4 horas', () => {
    const ingreso = moment.tz(STORE_TIMEZONE).subtract(4, 'hours').toDate();
    assert.equal(esTurnoActivoNocturno(ingreso), true);
});

test('esTurnoActivoNocturno retorna false para ingreso hace 20 horas', () => {
    const ingreso = moment.tz(STORE_TIMEZONE).subtract(20, 'hours').toDate();
    assert.equal(esTurnoActivoNocturno(ingreso), false);
});

test('requiereHoraEgresoExplicita retorna false para turno del mismo dia', () => {
    const hoy = obtenerFechaLocalActual();
    const ingreso = moment.tz(STORE_TIMEZONE).subtract(2, 'hours').toDate();
    assert.equal(requiereHoraEgresoExplicita(hoy, ingreso, hoy), false);
});

test('requiereHoraEgresoExplicita retorna false para turno nocturno activo de ayer', () => {
    const hoy = obtenerFechaLocalActual();
    const ayer = moment.tz(hoy, 'YYYY-MM-DD', STORE_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
    const ingreso = moment.tz(STORE_TIMEZONE).subtract(4, 'hours').toDate();
    assert.equal(requiereHoraEgresoExplicita(ayer, ingreso, hoy), false);
});

test('requiereHoraEgresoExplicita retorna true para turno olvidado de ayer', () => {
    const hoy = obtenerFechaLocalActual();
    const ayer = moment.tz(hoy, 'YYYY-MM-DD', STORE_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
    const ingreso = moment.tz(STORE_TIMEZONE).subtract(20, 'hours').toDate();
    assert.equal(requiereHoraEgresoExplicita(ayer, ingreso, hoy), true);
});
