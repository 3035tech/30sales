import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authTables from './auth-schema';
import { env } from '../config/env';
export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const database = drizzle(pool, { schema: authTables });
