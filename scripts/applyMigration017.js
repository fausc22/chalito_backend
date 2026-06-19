const fs = require('fs');
const path = require('path');
const db = require('../controllers/dbPromise');

async function main() {
    const sql = fs.readFileSync(
        path.join(__dirname, '../migrations/017_whatsapp_cliente_al_local.sql'),
        'utf8'
    );
    const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

    for (const statement of statements) {
        await db.execute(statement);
    }

    await db.execute(
        `INSERT INTO schema_migrations (filename) VALUES (?)
         ON DUPLICATE KEY UPDATE filename = filename`,
        ['017_whatsapp_cliente_al_local.sql']
    ).catch(() => {});

    const [rows] = await db.execute(
        `SELECT clave, valor FROM configuracion_sistema
         WHERE clave IN (
            'WHATSAPP_NOTIFICACIONES_ACTIVAS',
            'WHATSAPP_CLIENTE_ENVIA_AL_LOCAL',
            'WHATSAPP_NUMERO_CONTACTO',
            'WHATSAPP_TEMPLATE_CLIENTE_AL_LOCAL'
         )`
    );
    console.log('Configuración WhatsApp:');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
