const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parsearExtrasDelPayload,
    consolidarExtrasPorId,
    aplicarCantidadEfectivaExtra,
    construirSnapshotExtrasDesdeDb,
    normalizarExtras,
    construirPersonalizaciones,
    parsearCantidadExtra,
    CANTIDAD_EXTRA_MAXIMA
} = require('../../services/PersonalizacionesService');

test('parsearExtrasDelPayload legacy [3, 7] asigna cantidad 1', () => {
    const result = parsearExtrasDelPayload([3, 7]);
    assert.deepEqual(result, [
        { id: 3, cantidad: 1 },
        { id: 7, cantidad: 1 }
    ]);
});

test('parsearExtrasDelPayload nuevo formato con cantidad', () => {
    const result = parsearExtrasDelPayload([
        { id: 3, cantidad: 2 },
        { id: 7 }
    ]);
    assert.deepEqual(result, [
        { id: 3, cantidad: 2 },
        { id: 7, cantidad: 1 }
    ]);
});

test('parsearExtrasDelPayload consolida duplicados sumando cantidades', () => {
    const result = parsearExtrasDelPayload([
        { id: 3, cantidad: 2 },
        { id: 3, cantidad: 1 }
    ]);
    assert.deepEqual(result, [{ id: 3, cantidad: 3 }]);
});

test('parsearCantidadExtra rechaza 0, negativos y decimales', () => {
    assert.throws(() => parsearCantidadExtra(0), /al menos 1/);
    assert.throws(() => parsearCantidadExtra(-1), /al menos 1/);
    assert.throws(() => parsearCantidadExtra(1.5), /entero positivo/);
    assert.throws(() => parsearCantidadExtra('abc'), /entero positivo/);
});

test('parsearCantidadExtra rechaza cantidad mayor a 99', () => {
    assert.throws(() => parsearCantidadExtra(100), new RegExp(`${CANTIDAD_EXTRA_MAXIMA}`));
});

test('aplicarCantidadEfectivaExtra fuerza 1 si no permite cantidad', () => {
    assert.equal(aplicarCantidadEfectivaExtra(5, 0), 1);
    assert.equal(aplicarCantidadEfectivaExtra(5, false), 1);
});

test('aplicarCantidadEfectivaExtra respeta cantidad si permite_cantidad', () => {
    assert.equal(aplicarCantidadEfectivaExtra(2, 1), 2);
    assert.equal(aplicarCantidadEfectivaExtra(150, 1), CANTIDAD_EXTRA_MAXIMA);
});

test('construirSnapshotExtrasDesdeDb calcula precio_extra * cantidad', () => {
    const rows = [
        { id: 3, nombre: 'Extra Cheddar', precio_extra: 350, permite_cantidad: 1, disponible: 1 }
    ];
    const parsed = [{ id: 3, cantidad: 2 }];
    const { extrasSnapshot, extrasTotal } = construirSnapshotExtrasDesdeDb(rows, parsed);

    assert.equal(extrasSnapshot.length, 1);
    assert.equal(extrasSnapshot[0].cantidad, 2);
    assert.equal(extrasSnapshot[0].precio_extra, 350);
    assert.equal(extrasTotal, 700);
});

test('construirSnapshotExtrasDesdeDb fuerza cantidad 1 si no permite cantidad', () => {
    const rows = [
        { id: 7, nombre: 'Extra Mil Islas', precio_extra: 150, permite_cantidad: 0, disponible: 1 }
    ];
    const parsed = [{ id: 7, cantidad: 5 }];
    const { extrasSnapshot, extrasTotal } = construirSnapshotExtrasDesdeDb(rows, parsed);

    assert.equal(extrasSnapshot[0].cantidad, undefined);
    assert.equal(extrasTotal, 150);
});

test('normalizarExtras y construirPersonalizaciones con cantidad', () => {
    const { extras, extrasTotal } = normalizarExtras([
        { id: 3, nombre: 'Extra Cheddar', precio_extra: 350, cantidad: 2 }
    ]);
    assert.equal(extras[0].cantidad, 2);
    assert.equal(extrasTotal, 700);

    const pers = construirPersonalizaciones([
        { id: 3, nombre: 'Extra Cheddar', precio_extra: 350, cantidad: 2 }
    ]);
    assert.equal(pers.extrasTotal, 700);
});

test('normalizarExtras sin cantidad asume 1 (pedidos antiguos)', () => {
    const { extrasTotal } = normalizarExtras([
        { id: 3, nombre: 'Extra Cheddar', precio_extra: 350 }
    ]);
    assert.equal(extrasTotal, 350);
});

test('consolidarExtrasPorId suma cantidades por id', () => {
    const result = consolidarExtrasPorId([
        { id: 3, cantidad: 2 },
        { id: 3, cantidad: 3 }
    ]);
    assert.deepEqual(result, [{ id: 3, cantidad: 5 }]);
});

test('mapCartaItemsToMpFormat preserva cantidad en extras', () => {
    const { mapCartaItemsToMpFormat } = require('../../services/cartaPedidoPricingService');
    const mapped = mapCartaItemsToMpFormat([
        {
            productId: 12,
            quantity: 1,
            selectedExtras: [{ id: 3, cantidad: 2 }, { id: 7 }]
        }
    ]);
    assert.deepEqual(mapped[0].extras, [{ id: 3, cantidad: 2 }, { id: 7 }]);
});
