import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { databaseConnectionString } from './connection-string';
import { createDatabasePool } from './connection-pool';

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

  const pool = createDatabasePool({
    connectionString: databaseConnectionString(databaseUrl),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const [{ database, role, schema }] = await pool.query<{ database: string; role: string; schema: string }>(
      'SELECT current_database() AS database, current_user AS role, current_schema() AS schema',
    ).then((result) => result.rows);
    process.stdout.write(`Running database migrations on ${database} as ${role} in schema ${schema}.\n`);
    const dialect = new PgDialect();
    const session = drizzle(pool)._.session;
    const migrationsFolder = './drizzle';
    const migrations = readMigrationFiles({ migrationsFolder });

    for (const migration of migrations) {
      await dialect.migrate([migration], session, { migrationsFolder });
    }

    process.stdout.write('Database migrations completed.\n');
  } finally {
    await pool.end();
  }
}

void runMigrations().catch((error: unknown) => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
  const code = cause && 'code' in cause ? String(cause.code) : 'unknown';
  process.stderr.write(
    `Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}; ` +
      `cause=${cause?.message ?? 'unknown'}; code=${code}\n`,
  );
  process.exitCode = 1;
});
