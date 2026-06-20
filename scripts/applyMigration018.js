const fs = require('fs');
const path = require('path');
const db = require('../controllers/dbPromise');
const { CLIENTE_LOCAL_TEMPLATE_DB_KEYS } = require('../services/whatsappTemplateDefaults');

async function main() {
    const sql = fs.readFileSync(
        path.join(__dirname, '../migrations/018_whatsapp_plantillas_cliente_local.sql'),
        'utf8'
    );
    const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((stmt) => stmt && !stmt.split('\n').every((line) => line.trim().startsWith('--') || line.trim() === ''));

    for (const statement of statements) {
        await db.execute(statement);
    }

    await db
        .execute(
            `INSERT INTO schema_migrations (filename) VALUES (?)
             ON DUPLICATE KEY UPDATE filename = filename`,
            ['018_whatsapp_plantillas_cliente_local.sql']
        )
        .catch(() => {});

    const claves = Object.values(CLIENTE_LOCAL_TEMPLATE_DB_KEYS);
    const placeholders = claves.map(() => '?').join(',');
    const [rows] = await db.execute(
        `SELECT clave FROM configuracion_sistema WHERE clave IN (${placeholders})`,
        claves
    );
    console.log('Migración 018 — plantillas cliente→local');
    console.log(`Claves presentes: ${rows.length}/${claves.length}`);
    console.log(rows.map((row) => row.clave).join('\n'));
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
