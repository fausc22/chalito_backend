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
        for (const fileName of migrationFiles) {
            const fullPath = path.join(migrationsDir, fileName);
            console.log(`\nEjecutando migracion: ${fileName}`);

            const rawSql = await fs.readFile(fullPath, 'utf8');
            const statements = splitSqlStatements(rawSql);

            if (!statements.length) {
                console.log(`- ${fileName} no contiene sentencias ejecutables.`);
                continue;
            }

            for (const statement of statements) {
                // query() evita prepared statements; execute() falla con cierto DDL (p. ej. columnas GENERATED).
                await connection.query(statement);
            }

            console.log(`- Migracion completada: ${fileName}`);
        }
    } finally {
        connection.release();
    }

    console.log('\nMigraciones finalizadas correctamente.');
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
