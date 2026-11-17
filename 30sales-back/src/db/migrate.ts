import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    process.stdout.write('Database migrations completed.\n');
  } finally {
    await pool.end();
  }
}

void runMigrations().catch((error: unknown) => {
  process.stderr.write(`Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exitCode = 1;
});
