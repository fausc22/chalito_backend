/**
 * Marca migraciones como ya aplicadas sin ejecutar el SQL.
 * Uso (DB existente antes de schema_migrations):
 *   node scripts/markMigrationsApplied.js 001_empleados_base.sql 002_stock_semanal_inventario.sql
 */
const db = require('../controllers/dbPromise');

async function main() {
    const filenames = process.argv.slice(2).filter(Boolean);
    if (!filenames.length) {
        console.error('Indica al menos un archivo, ej.: node scripts/markMigrationsApplied.js 001_empleados_base.sql');
        process.exit(1);
    }

    const connection = await db.getConnection();
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INT NOT NULL AUTO_INCREMENT,
                filename VARCHAR(255) NOT NULL,
                executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_schema_migrations_filename (filename)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);

        for (const filename of filenames) {
            await connection.query(
                'INSERT IGNORE INTO schema_migrations (filename) VALUES (?)',
                [filename]
            );
            console.log(`Marcada: ${filename}`);
        }
    } finally {
        connection.release();
    }
}

main()
    .then(async () => {
        await db.end();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error(error.message);
        try {
            await db.end();
        } catch (_) {
            /* ignore */
        }
        process.exit(1);
    });
