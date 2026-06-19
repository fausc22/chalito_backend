const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const formatDateTimeForMySQLInArgentina = (dateInput) => {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

    if (Number.isNaN(date.getTime())) {
        throw new Error('Fecha inválida');
    }

    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(date);
};

test('formatDateTimeForMySQLInArgentina convierte ISO UTC a hora Argentina para MySQL', () => {
    assert.equal(
        formatDateTimeForMySQLInArgentina('2026-06-20T01:30:00.000Z'),
        '2026-06-19 22:30:00'
    );
});

test('formatDateTimeForMySQLInArgentina resta minutos vía Date antes de formatear', () => {
    const horario = new Date('2026-06-20T01:30:00.000Z');
    const inicio = new Date(horario.getTime() - 15 * 60 * 1000);
    assert.equal(formatDateTimeForMySQLInArgentina(inicio), '2026-06-19 22:15:00');
});

test('formatDateTimeForMySQLInArgentina lanza en fecha inválida', () => {
    assert.throws(
        () => formatDateTimeForMySQLInArgentina('no-es-fecha'),
        /Fecha inválida/
    );
});

test('actualizarHorarioEntrega formatea fechas antes del UPDATE', () => {
    const controllerPath = path.join(__dirname, '../controllers/pedidosController.js');
    const source = fs.readFileSync(controllerPath, 'utf8');
    const fnStart = source.indexOf('const actualizarHorarioEntrega = async');
    assert.ok(fnStart >= 0);
    const fnBlock = source.slice(fnStart, fnStart + 4000);

    assert.match(fnBlock, /horarioEntregaMysql = formatDateTimeForMySQLInArgentina/);
    assert.match(fnBlock, /horaInicioPreparacionMysql = formatDateTimeForMySQLInArgentina/);
    assert.match(fnBlock, /\[horarioEntregaMysql, prioridad, horaInicioPreparacionMysql, id\]/);
    assert.doesNotMatch(fnBlock, /\[horarioEntrega \|\| null, prioridad, horaInicioPreparacion/);
});

test('actualizarHorarioEntrega usa el helper solo dentro de la función', () => {
    const controllerPath = path.join(__dirname, '../controllers/pedidosController.js');
    const source = fs.readFileSync(controllerPath, 'utf8');
    const fnStart = source.indexOf('const actualizarHorarioEntrega = async');
    const fnEnd = source.indexOf('const actualizarObservaciones = async');
    assert.ok(fnStart >= 0 && fnEnd > fnStart);
    const fnBlock = source.slice(fnStart, fnEnd);
    const occurrences = fnBlock.match(/formatDateTimeForMySQLInArgentina/g) || [];
    assert.equal(occurrences.length, 2);
});
