#!/usr/bin/env node
/**
 * Reconcilia gastos legacy registrados en una cuenta distinta de X
 * hacia la cuenta operativa del sistema.
 *
 * Uso:
 *   node scripts/reconcileGastosCuentaX.js           # dry-run
 *   node scripts/reconcileGastosCuentaX.js --confirm # aplica cambios
 */

require('dotenv').config();

const db = require('../controllers/dbPromise');
const CuentasSistema = require('../services/CuentasSistemaService');

async function main() {
    const confirm = process.argv.includes('--confirm');
    const connection = await db.getConnection();

    try {
        const cuentaX = await CuentasSistema.obtenerCuentaX(connection);
        const cuentaXId = cuentaX.id;

        const [gastosLegacy] = await connection.execute(
            `SELECT id, monto, cuenta_id, descripcion, categoria_nombre
             FROM gastos
             WHERE cuenta_id IS NOT NULL AND cuenta_id != ?`,
            [cuentaXId]
        );

        if (gastosLegacy.length === 0) {
            console.log('✅ No hay gastos legacy fuera de la cuenta X.');
            return;
        }

        console.log(`Encontrados ${gastosLegacy.length} gasto(s) fuera de cuenta X (id=${cuentaXId}).`);

        for (const gasto of gastosLegacy) {
            const monto = parseFloat(gasto.monto) || 0;
            console.log(
                `  - Gasto #${gasto.id}: $${monto} en cuenta ${gasto.cuenta_id} → X`
            );
        }

        if (!confirm) {
            console.log('\nDry-run. Ejecutá con --confirm para aplicar los ajustes.');
            return;
        }

        await connection.beginTransaction();

        for (const gasto of gastosLegacy) {
            const monto = parseFloat(gasto.monto) || 0;
            const cuentaAnterior = gasto.cuenta_id;

            await CuentasSistema.acreditarCuenta(
                connection,
                cuentaAnterior,
                monto,
                `Reconciliación Gasto #${gasto.id} - Reversión`,
                gasto.id
            );

            await CuentasSistema.debitarCuenta(
                connection,
                cuentaXId,
                monto,
                `Reconciliación Gasto #${gasto.id} - ${gasto.categoria_nombre || 'Gasto'}`,
                gasto.id
            );

            await connection.execute(
                'UPDATE gastos SET cuenta_id = ? WHERE id = ?',
                [cuentaXId, gasto.id]
            );
        }

        await connection.commit();
        console.log(`\n✅ Reconciliados ${gastosLegacy.length} gasto(s) hacia cuenta X.`);
    } catch (error) {
        try {
            await connection.rollback();
        } catch (_) {}
        console.error('❌ Error en reconciliación:', error.message);
        process.exitCode = 1;
    } finally {
        connection.release();
    }
}

main();
