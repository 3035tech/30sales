import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { databaseConnectionString } from './connection-string';

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

  const pool = new Pool({
    connectionString: databaseConnectionString(databaseUrl),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const [{ database, role }] = await pool.query<{ database: string; role: string }>(
      'SELECT current_database() AS database, current_user AS role',
    ).then((result) => result.rows);
    process.stdout.write(`Running database migrations on ${database} as ${role}.\n`);
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
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
