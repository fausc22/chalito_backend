#!/usr/bin/env node
/**
 * Limpia datos operativos de prueba y deja el catálogo de inventario intacto.
 *
 * Uso:
 *   node scripts/resetOperationalData.js           # dry-run: solo muestra conteos
 *   node scripts/resetOperationalData.js --confirm # ejecuta TRUNCATE + resets
 *
 * Antes de ejecutar con --confirm:
 *   1. Backup: mysqldump -u USER -p BD > backup.sql
 *   2. pm2 stop chalito-prod  (o el proceso que escriba en la BD)
 */

require('dotenv').config();

const db = require('../controllers/dbPromise');

/** Tablas a vaciar, en orden (hijos antes que padres). */
const OPERATIONAL_TABLES = [
    'arca_solicitudes_log',
    'ventas_contenido',
    'ventas',
    'cupones_redenciones',
    'comandas_contenido',
    'comandas',
    'pedidos_contenido',
    'pedidos_pagos',
    'checkout_sesiones_mp',
    'pedidos',
    'movimientos_fondos',
    'gastos',
    'clientes_direcciones',
    'clientes',
    'semanas_stock_detalle',
    'semanas_stock',
    'empleados_asistencias',
    'empleados_movimientos',
    'empleados_liquidaciones',
    'auditorias'
];

/** Tablas que deben seguir con datos después del reset. */
const INVENTORY_TABLES = [
    'articulos',
    'categorias',
    'ingredientes',
    'articulos_contenido',
    'adicionales',
    'adicionales_contenido',
    'usuarios',
    'cuentas_fondos',
    'categoria_gastos',
    'cupones',
    'configuracion_sistema'
];

const POST_RESET_SQL = [
    {
        label: 'stock de artículos (controla_stock=1 → 0)',
        sql: 'UPDATE articulos SET stock_actual = 0 WHERE controla_stock = 1'
    },
    {
        label: 'saldos de cuentas de fondos → 0',
        sql: 'UPDATE cuentas_fondos SET saldo = 0'
    },
    {
        label: 'usos de cupones → 0',
        sql: 'UPDATE cupones SET usos_actuales = 0'
    },
    {
        label: 'numeración ARCA → 0',
        sql: 'UPDATE control_numeracion_facturas SET ultimo_numero = 0'
    }
];

async function tableExists(tableName) {
    const [rows] = await db.execute(
        `SELECT 1 AS ok
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?
         LIMIT 1`,
        [tableName]
    );
    return rows.length > 0;
}

async function countRows(tableName) {
    const [rows] = await db.execute(`SELECT COUNT(*) AS c FROM \`${tableName}\``);
    return Number(rows[0].c);
}

async function collectCounts(tableNames) {
    const counts = [];
    for (const table of tableNames) {
        if (!(await tableExists(table))) {
            counts.push({ table, count: null, missing: true });
            continue;
        }
        counts.push({ table, count: await countRows(table), missing: false });
    }
    return counts;
}

function printCounts(title, counts) {
    console.log(`\n${title}`);
    console.log('-'.repeat(48));
    for (const { table, count, missing } of counts) {
        if (missing) {
            console.log(`  ${table.padEnd(28)} (no existe en esta BD)`);
        } else {
            console.log(`  ${table.padEnd(28)} ${count}`);
        }
    }
}

async function main() {
    const confirm = process.argv.includes('--confirm');
    const dbName = process.env.DB_DATABASE || '(sin DB_DATABASE en .env)';

    console.log('══════════════════════════════════════════════════');
    console.log('  Reset operativo — El Chalito');
    console.log('══════════════════════════════════════════════════');
    console.log(`Base de datos: ${dbName}`);
    console.log(`Modo: ${confirm ? 'EJECUCIÓN (--confirm)' : 'DRY-RUN (solo lectura)'}`);

    const operationalCounts = await collectCounts(OPERATIONAL_TABLES);
    const inventoryCounts = await collectCounts(INVENTORY_TABLES);

    printCounts('Tablas que se VACIARÁN', operationalCounts);
    printCounts('Tablas de inventario/config (se conservan)', inventoryCounts);

    if (!confirm) {
        console.log('\n⚠️  No se modificó nada.');
        console.log('   Para ejecutar la limpieza:');
        console.log('   node scripts/resetOperationalData.js --confirm');
        console.log('\n   Recordá: backup + detener PM2 antes de confirmar.\n');
        await db.end();
        return;
    }

    console.log('\n⏳ Ejecutando limpieza...\n');

    await db.execute('SET FOREIGN_KEY_CHECKS = 0');

    const truncated = [];
    const skipped = [];

    for (const table of OPERATIONAL_TABLES) {
        if (!(await tableExists(table))) {
            skipped.push(table);
            console.log(`  ⊘ ${table} — omitida (no existe)`);
            continue;
        }
        await db.execute(`TRUNCATE TABLE \`${table}\``);
        truncated.push(table);
        console.log(`  ✓ ${table} — vaciada`);
    }

    await db.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n⏳ Ajustes post-limpieza...\n');

    for (const { label, sql } of POST_RESET_SQL) {
        if (sql.includes('control_numeracion_facturas') && !(await tableExists('control_numeracion_facturas'))) {
            console.log(`  ⊘ ${label} — omitido (tabla no existe)`);
            continue;
        }
        if (sql.includes('cupones') && !(await tableExists('cupones'))) {
            console.log(`  ⊘ ${label} — omitido (tabla no existe)`);
            continue;
        }
        const [result] = await db.execute(sql);
        const affected = result.affectedRows ?? 0;
        console.log(`  ✓ ${label} (${affected} filas afectadas)`);
    }

    const afterOperational = await collectCounts(
        operationalCounts.filter((r) => !r.missing).map((r) => r.table)
    );
    const afterInventory = await collectCounts(
        inventoryCounts.filter((r) => !r.missing).map((r) => r.table)
    );

    printCounts('Verificación — operativo (debe ser 0)', afterOperational);
    printCounts('Verificación — inventario (debe mantener datos)', afterInventory);

    console.log('\n✅ Limpieza completada.');
    console.log(`   Tablas vaciadas: ${truncated.length}`);
    if (skipped.length) {
        console.log(`   Omitidas: ${skipped.join(', ')}`);
    }
    console.log('   Reiniciá el backend: pm2 start chalito-prod\n');

    await db.end();
}

main().catch(async (err) => {
    console.error('\n❌ Error:', err.message);
    try {
        await db.execute('SET FOREIGN_KEY_CHECKS = 1');
    } catch {
        // ignore
    }
    try {
        await db.end();
    } catch {
        // ignore
    }
    process.exit(1);
});
