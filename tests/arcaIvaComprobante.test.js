const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

async function cargarModulos() {
    const formatters = await import('../arca-microservice/utils/formatters.js');
    const validators = await import('../arca-microservice/utils/validators.js');
    const types = await import('../arca-microservice/types/billing.types.js');
    return { formatters, validators, types };
}

function ventaGravada21({ tipoComprobante, condicionIVA, importes }) {
    const datos = {
        tipoComprobante,
        concepto: 1,
        cliente: {
            tipoDocumento: 99,
            numeroDocumento: '0',
            condicionIVA
        },
        items: [
            {
                descripcion: 'Producto gravado',
                cantidad: 1,
                precioUnitario: 100,
                alicuotaIVA: 5
            }
        ]
    };

    if (importes) {
        datos.impNeto = importes.neto;
        datos.impIVA = importes.iva;
        datos.impOpEx = importes.opEx;
        datos.impTotal = importes.total;
    }

    return datos;
}

describe('WSFEv1: IVA de una venta gravada', () => {
    it('Factura B a Exento informa 100 / 21 / 121 con alícuota 5 y ImpOpEx 0', async () => {
        const { formatters, validators } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA(
            ventaGravada21({ tipoComprobante: 6, condicionIVA: 4 }),
            1,
            1
        );

        assert.equal(arca.CbteTipo, 6);
        assert.equal(arca.CondicionIVAReceptorId, 4);
        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 21);
        assert.equal(arca.ImpOpEx, 0);
        assert.equal(arca.ImpTotal, 121);
        assert.deepEqual(arca.Iva, [{ Id: 5, BaseImp: 100, Importe: 21 }]);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('Factura A a Responsable Inscripto manda los mismos importes y la misma alícuota', async () => {
        const { formatters, validators } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA(
            ventaGravada21({ tipoComprobante: 1, condicionIVA: 1 }),
            1,
            1
        );

        assert.equal(arca.CbteTipo, 1);
        assert.equal(arca.CondicionIVAReceptorId, 1);
        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 21);
        assert.equal(arca.ImpOpEx, 0);
        assert.equal(arca.ImpTotal, 121);
        assert.deepEqual(arca.Iva, [{ Id: 5, BaseImp: 100, Importe: 21 }]);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('una NC B de esa venta gravada a un Exento acredita el IVA, no lo pasa a ImpOpEx', async () => {
        const { formatters, validators } = await cargarModulos();
        const datos = ventaGravada21({ tipoComprobante: 8, condicionIVA: 4 });
        datos.comprobantesAsociados = [{ tipo: 6, puntoVenta: 1, numero: 20 }];

        const arca = formatters.transformarAFormatoARCA(datos, 2, 1);

        assert.equal(arca.CbteTipo, 8);
        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 21);
        assert.equal(arca.ImpOpEx, 0);
        assert.equal(arca.ImpTotal, 121);
        assert.deepEqual(arca.Iva, [{ Id: 5, BaseImp: 100, Importe: 21 }]);
        assert.equal(arca.CbtesAsoc[0].Tipo, 6);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('respeta el neto, el IVA y el total ya guardados antes del CAE', async () => {
        const { formatters, validators } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA(
            ventaGravada21({
                tipoComprobante: 6,
                condicionIVA: 4,
                importes: { neto: 82.64, iva: 17.36, opEx: 0, total: 100 }
            }),
            1,
            1
        );

        assert.equal(arca.ImpNeto, 82.64);
        assert.equal(arca.ImpIVA, 17.36);
        assert.equal(arca.ImpOpEx, 0);
        assert.equal(arca.ImpTotal, 100);
        assert.deepEqual(arca.Iva, [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }]);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('un ítem al 0 % sigue en alícuota 3 con ImpIVA 0', async () => {
        const { formatters, validators } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA({
            tipoComprobante: 6,
            concepto: 1,
            cliente: {
                tipoDocumento: 99,
                numeroDocumento: '0',
                condicionIVA: 4
            },
            items: [
                {
                    descripcion: 'No gravado',
                    cantidad: 1,
                    precioUnitario: 100,
                    alicuotaIVA: 3
                }
            ]
        }, 1, 1);

        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 0);
        assert.equal(arca.ImpOpEx, 0);
        assert.equal(arca.ImpTotal, 100);
        assert.deepEqual(arca.Iva, [{ Id: 3, BaseImp: 100, Importe: 0 }]);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('una operación exenta usa ImpOpEx y no la convierte al 21 %', async () => {
        const { formatters, validators } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA({
            tipoComprobante: 6,
            concepto: 1,
            cliente: {
                tipoDocumento: 99,
                numeroDocumento: '0',
                condicionIVA: 5
            },
            items: [
                {
                    descripcion: 'Gravado',
                    cantidad: 1,
                    precioUnitario: 100,
                    alicuotaIVA: 5
                },
                {
                    descripcion: 'Exento de la operación',
                    cantidad: 1,
                    precioUnitario: 40,
                    alicuotaIVA: 2
                }
            ]
        }, 1, 1);

        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 21);
        assert.equal(arca.ImpOpEx, 40);
        assert.equal(arca.ImpTotal, 161);
        assert.deepEqual(arca.Iva, [{ Id: 5, BaseImp: 100, Importe: 21 }]);

        const validacion = validators.validarDatosComprobante(arca);
        assert.equal(validacion.valido, true, validacion.errores.join('; '));
    });

    it('la alícuota 10,5 % no se reemplaza por 21 % ni por 0 %', async () => {
        const { formatters } = await cargarModulos();
        const arca = formatters.transformarAFormatoARCA({
            tipoComprobante: 6,
            concepto: 1,
            cliente: {
                tipoDocumento: 99,
                numeroDocumento: '0',
                condicionIVA: 4
            },
            items: [
                {
                    descripcion: 'Reducido',
                    cantidad: 1,
                    precioUnitario: 100,
                    alicuotaIVA: 4
                }
            ]
        }, 1, 1);

        assert.equal(arca.ImpNeto, 100);
        assert.equal(arca.ImpIVA, 10.5);
        assert.equal(arca.ImpOpEx, 0);
        assert.deepEqual(arca.Iva, [{ Id: 4, BaseImp: 100, Importe: 10.5 }]);
    });

    it('rechaza ImpIVA 0 con alícuota 5', async () => {
        const { validators } = await cargarModulos();
        const hoy = new Date();
        const fecha = parseInt(
            `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`,
            10
        );

        const validacion = validators.validarDatosComprobante({
            CantReg: 1,
            PtoVta: 1,
            CbteTipo: 6,
            Concepto: 1,
            DocTipo: 99,
            DocNro: 0,
            CbteDesde: 1,
            CbteHasta: 1,
            CbteFch: fecha,
            ImpTotal: 100,
            ImpTotConc: 0,
            ImpNeto: 100,
            ImpOpEx: 0,
            ImpIVA: 0,
            ImpTrib: 0,
            MonId: 'PES',
            MonCotiz: 1,
            CondicionIVAReceptorId: 4,
            Iva: [{ Id: 5, BaseImp: 100, Importe: 0 }]
        });

        assert.equal(validacion.valido, false);
        assert.ok(
            validacion.errores.some((error) => error.includes('alícuota 5') || error.includes('id 3'))
        );
    });
});

describe('letra del comprobante según el receptor', () => {
    it('A solo para Responsable Inscripto; B para Exento, Consumidor Final y Monotributo', async () => {
        const { types } = await cargarModulos();
        const { validarCombinaciónComprobanteIVA, determinarTipoComprobante } = types;

        assert.equal(determinarTipoComprobante(1), 1);
        assert.equal(determinarTipoComprobante(4), 6);
        assert.equal(determinarTipoComprobante(5), 6);
        assert.equal(determinarTipoComprobante(6), 6);

        assert.equal(validarCombinaciónComprobanteIVA(1, 1), true);
        assert.equal(validarCombinaciónComprobanteIVA(6, 4), true);
        assert.equal(validarCombinaciónComprobanteIVA(6, 5), true);
        assert.equal(validarCombinaciónComprobanteIVA(6, 6), true);
        assert.equal(validarCombinaciónComprobanteIVA(8, 4), true);

        assert.equal(validarCombinaciónComprobanteIVA(1, 4), false);
        assert.equal(validarCombinaciónComprobanteIVA(1, 6), false);
        assert.equal(validarCombinaciónComprobanteIVA(6, 1), false);
    });
});
