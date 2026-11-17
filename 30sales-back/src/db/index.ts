import { drizzle } from 'drizzle-orm/node-postgres';
import * as authTables from './auth-schema';
import { accountSegments, accounts, assistantRuns, campaignDraftAudiences, campaignDrafts, campaignNoSendDates, externalRecords, leadStatusHistory, leads, messageAttachments, people } from './schema';
import { env } from '../config/env';
import { databaseConnectionString } from './connection-string';
import { createDatabasePool } from './connection-pool';
export const pool = createDatabasePool({ connectionString: databaseConnectionString(env.DATABASE_URL), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
export const database = drizzle(pool, { schema: { ...authTables, accountSegments, accounts, people, leads, leadStatusHistory, externalRecords, messageAttachments, assistantRuns, campaignDrafts, campaignDraftAudiences, campaignNoSendDates } });
