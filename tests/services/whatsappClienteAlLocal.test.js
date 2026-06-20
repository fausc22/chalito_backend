const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeWaMeNumber,
    buildWaMeUrl,
    resolveTemplateClienteAlLocal,
    resolveClienteLocalTemplateForPedido,
    buildClienteAlLocalMessage,
    buildBloqueEntrega,
    buildBloqueRetiro,
    buildBloqueAbono,
    buildBloqueTransferencia,
    buildBloqueMercadoPago,
    buildBloqueDescuento,
    formatContenidoClienteAlLocal,
} = require('../../services/whatsappClienteAlLocalService');
const { DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL } = require('../../services/whatsappTemplateDefaults');

test('normalizeWaMeNumber agrega prefijo Argentina movil', () => {
    assert.equal(normalizeWaMeNumber('2302633818'), '5492302633818');
    assert.equal(normalizeWaMeNumber('5492302633818'), '5492302633818');
});

test('formatContenidoClienteAlLocal usa emoji y precio por linea', () => {
    const contenido = formatContenidoClienteAlLocal([
        {
            cantidad: 1,
            articulo_nombre: 'HAMBURGUESA WEISSMAN Triple',
            subtotal: 15000,
        },
    ]);

    assert.ok(contenido.includes('✅ 1 x HAMBURGUESA WEISSMAN Triple'));
});

test('buildBloqueEntrega incluye direccion completa, entre calles y observaciones', () => {
    const bloque = buildBloqueEntrega({
        modalidad: 'DELIVERY',
        cliente_direccion: 'Calle: 403 | Altura: 195 | Entre calles: 300 y 404 | Edificio/Casa: Torre A | Piso/Depto: 2B',
        observaciones: 'Timbre roto',
    });

    assert.ok(bloque.includes('Entregar en Calle 403 número 195'));
    assert.ok(bloque.includes('Entre calles: 300 y 404'));
    assert.ok(bloque.includes('Edificio/Casa: Torre A'));
    assert.ok(bloque.includes('Piso/Depto: 2B'));
    assert.ok(bloque.includes('Timbre roto'));
});

test('buildBloqueRetiro solo en retiro', () => {
    assert.ok(buildBloqueRetiro({ modalidad: 'RETIRO' }).includes('Retiro en el local'));
    assert.equal(buildBloqueRetiro({ modalidad: 'DELIVERY' }), '');
});

test('buildBloqueTransferencia incluye alias configurado', () => {
    const bloque = buildBloqueTransferencia(
        { medio_pago: 'TRANSFERENCIA' },
        'elchalito.mp'
    );
    assert.ok(bloque.includes('Alias para transferir: elchalito.mp'));
});

test('buildBloqueMercadoPago solo si pagado', () => {
    assert.ok(
        buildBloqueMercadoPago({ medio_pago: 'MERCADOPAGO', estado_pago: 'PAGADO' })
            .includes('Pago acreditado')
    );
    assert.equal(buildBloqueMercadoPago({ medio_pago: 'MERCADOPAGO', estado_pago: 'PENDIENTE' }), '');
});

test('buildBloqueDescuento con cupon', () => {
    const bloque = buildBloqueDescuento({
        cupon_codigo: 'PROMO10',
        descuento_cupon: 2000,
    });
    assert.ok(bloque.includes('Cupón PROMO10'));
});

test('buildClienteAlLocalMessage delivery efectivo y transferencia', () => {
    const basePedido = {
        id: 42,
        cliente_nombre: 'Federico López Vital',
        cliente_telefono: '23025551234',
        modalidad: 'DELIVERY',
        subtotal: 29000,
        total: 29000,
        cliente_direccion: 'Calle: 403 | Altura: 195 | Entre calles: 300 y 404',
        observaciones: 'Timbre roto',
    };
    const items = [
        { cantidad: 1, articulo_nombre: 'HAMBURGUESA WEISSMAN Triple', subtotal: 15000 },
        { cantidad: 1, articulo_nombre: 'HAMBURGUESA DIABLA Doble', subtotal: 14000 },
    ];

    const efectivo = buildClienteAlLocalMessage({
        template: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
        pedido: { ...basePedido, medio_pago: 'EFECTIVO', monto_con_cuanto_abona: 29000 },
        items,
        nombreNegocio: 'El Chalito',
        aliasTransferencia: 'elchalito.mp',
    });

    assert.ok(efectivo.includes('Abono con:'));
    assert.ok(efectivo.includes('DELIVERY'));
    assert.ok(efectivo.includes('Pedido: WEB-42'));
    assert.ok(!efectivo.includes('Subtotal pedido:'));

    const transferencia = buildClienteAlLocalMessage({
        template: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
        pedido: { ...basePedido, medio_pago: 'TRANSFERENCIA' },
        items,
        nombreNegocio: 'El Chalito',
        aliasTransferencia: 'elchalito.mp',
    });

    assert.ok(transferencia.includes('Alias para transferir: elchalito.mp'));
    assert.ok(!transferencia.includes('Abono con:'));
});

test('resolveTemplateClienteAlLocal usa default si faltan placeholders obligatorios', () => {
    const template = resolveTemplateClienteAlLocal('Solo {{cliente}}');
    assert.equal(template, DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL);
});

test('buildWaMeUrl genera enlace wa.me', () => {
    const url = buildWaMeUrl('5492302633818', 'Hola pedido');
    assert.ok(url.startsWith('https://wa.me/5492302633818?text='));
});

test('resolveClienteLocalTemplateForPedido resuelve las 6 combinaciones medio/modalidad', () => {
    const templates = {
        EFECTIVO_RETIRO: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} EF_R',
        EFECTIVO_DELIVERY: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} EF_D',
        TRANSFERENCIA_RETIRO: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} TR_R',
        TRANSFERENCIA_DELIVERY: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} TR_D',
        MERCADOPAGO_RETIRO: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} MP_R',
        MERCADOPAGO_DELIVERY: 'Hola {{cliente}} {{modalidad}} {{contenido}} {{total}} {{medio_pago}} {{codigo_pedido}} MP_D',
    };
    const settings = {
        plantillasClienteLocal: templates,
        templateClienteAlLocal: DEFAULT_TEMPLATE_CLIENTE_AL_LOCAL,
    };

    for (const [key, expectedSuffix] of Object.entries({
        EFECTIVO_RETIRO: 'EF_R',
        EFECTIVO_DELIVERY: 'EF_D',
        TRANSFERENCIA_RETIRO: 'TR_R',
        TRANSFERENCIA_DELIVERY: 'TR_D',
        MERCADOPAGO_RETIRO: 'MP_R',
        MERCADOPAGO_DELIVERY: 'MP_D',
    })) {
        const result = resolveClienteLocalTemplateForPedido(key, settings);
        assert.ok(result.endsWith(expectedSuffix), `clave ${key}`);
    }
});
