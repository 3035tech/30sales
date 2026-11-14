import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authTables from './auth-schema';
import { accounts, leadStatusHistory, leads, people } from './schema';
import { env } from '../config/env';
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
export const database = drizzle(pool, { schema: { ...authTables, accounts, people, leads, leadStatusHistory } });
