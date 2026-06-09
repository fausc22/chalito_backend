const fs = require('fs/promises');
const path = require('path');
const db = require('../controllers/dbPromise');

function splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;

    for (let i = 0; i < sql.length; i += 1) {
        const char = sql[i];
        const prev = i > 0 ? sql[i - 1] : '';

        if (char === "'" && !inDoubleQuote && !inBacktick && prev !== '\\') {
            inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote && !inBacktick && prev !== '\\') {
            inDoubleQuote = !inDoubleQuote;
        } else if (char === '`' && !inSingleQuote && !inDoubleQuote && prev !== '\\') {
            inBacktick = !inBacktick;
        }

        if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
            const statement = current.trim();
            if (statement) {
                statements.push(statement);
            }
            current = '';
            continue;
        }

        current += char;
    }

    const lastStatement = current.trim();
    if (lastStatement) {
        statements.push(lastStatement);
    }

    return statements;
}

async function ensureMigrationsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT NOT NULL AUTO_INCREMENT,
            filename VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_schema_migrations_filename (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
}

async function getAppliedMigrations(connection) {
    const [rows] = await connection.query(
        'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    return new Set(rows.map((row) => row.filename));
}

async function markMigrationApplied(connection, fileName) {
    await connection.query(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [fileName]
    );
}

async function runMigrations() {
    const migrationsDir = path.resolve(__dirname, '../migrations');
    console.log(`Buscando migraciones en: ${migrationsDir}`);

    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const migrationFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, 'es'));

    if (!migrationFiles.length) {
        console.log('No se encontraron migraciones SQL para ejecutar.');
        return;
    }

    const connection = await db.getConnection();
    try {
        await ensureMigrationsTable(connection);
        const applied = await getAppliedMigrations(connection);

        let executedCount = 0;
        let skippedCount = 0;

        for (const fileName of migrationFiles) {
            if (applied.has(fileName)) {
                console.log(`- Omitida (ya aplicada): ${fileName}`);
                skippedCount += 1;
                continue;
            }

            const fullPath = path.join(migrationsDir, fileName);
            console.log(`\nEjecutando migracion: ${fileName}`);

            const rawSql = await fs.readFile(fullPath, 'utf8');
            const statements = splitSqlStatements(rawSql);

            if (!statements.length) {
                console.log(`- ${fileName} no contiene sentencias ejecutables.`);
                await markMigrationApplied(connection, fileName);
                executedCount += 1;
                continue;
            }

            for (const statement of statements) {
                // query() evita prepared statements; execute() falla con cierto DDL (p. ej. columnas GENERATED).
                await connection.query(statement);
            }

            await markMigrationApplied(connection, fileName);
            console.log(`- Migracion completada: ${fileName}`);
            executedCount += 1;
        }

        console.log(
            `\nMigraciones finalizadas. Ejecutadas: ${executedCount}, omitidas: ${skippedCount}.`
        );
    } finally {
        connection.release();
    }
}

runMigrations()
    .then(async () => {
        await db.end();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('\nError ejecutando migraciones:', error.message);
        try {
            await db.end();
        } catch (closeError) {
            console.error('Error cerrando conexion:', closeError.message);
        }
        process.exit(1);
    });
