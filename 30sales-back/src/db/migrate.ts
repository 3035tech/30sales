import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { databaseConnectionString } from './connection-string';
import { createDatabasePool } from './connection-pool';
import * as authTables from './auth-schema';
import { businessLineMembers, businessLines, leads, messagingChannels, pipelines } from './schema';
import { selectBusinessLineBackfillCreator } from './business-line-backfill-creator';

async function backfillDefaultBusinessLines(pool: ReturnType<typeof createDatabasePool>): Promise<void> {
  const database = drizzle(pool, { schema: { ...authTables, businessLineMembers, businessLines, leads, messagingChannels, pipelines } });
  const [legacyPipelineOrganizations, legacyChannelOrganizations, legacyLeadOrganizations] = await Promise.all([
    database.select({ id: pipelines.organizationId }).from(pipelines).where(isNull(pipelines.businessLineId)).groupBy(pipelines.organizationId),
    database.select({ id: messagingChannels.organizationId }).from(messagingChannels).where(isNull(messagingChannels.businessLineId)).groupBy(messagingChannels.organizationId),
    database.select({ id: leads.organizationId }).from(leads).where(isNull(leads.businessLineId)).groupBy(leads.organizationId),
  ]);
  const legacyOrganizations = [...new Set([...legacyPipelineOrganizations, ...legacyChannelOrganizations, ...legacyLeadOrganizations].map(({ id }) => id))].sort();

  for (const organizationId of legacyOrganizations) {
    await database.transaction(async (transaction) => {
      const members = await transaction.select({ userId: authTables.member.userId }).from(authTables.member)
        .where(eq(authTables.member.organizationId, organizationId)).orderBy(asc(authTables.member.createdAt), asc(authTables.member.id)).limit(1);
      const activeInvitations = await transaction.select({ inviterId: authTables.invitation.inviterId }).from(authTables.invitation)
        .where(and(eq(authTables.invitation.organizationId, organizationId), eq(authTables.invitation.status, 'pending'), gt(authTables.invitation.expiresAt, new Date())))
        .orderBy(asc(authTables.invitation.createdAt), asc(authTables.invitation.id)).limit(1);
      const creatorUserId = selectBusinessLineBackfillCreator(members, activeInvitations);
      if (!creatorUserId) {
        process.stderr.write(`Skipping default business line backfill for organization ${organizationId}: no member or active invitation is available.\n`);
        return;
      }

      let [defaultLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.isDefault, true))).limit(1);
      if (!defaultLine) {
        const slug = `operacao-geral-${organizationId.replaceAll('-', '').slice(0, 8)}`;
        await transaction.insert(businessLines).values({ organizationId, name: 'Operação geral', slug, isDefault: true, createdByUserId: creatorUserId });
        ;[defaultLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
          .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.isDefault, true))).limit(1);
      }
      if (!defaultLine) throw new Error(`Default business line could not be initialized for organization ${organizationId}.`);

      const organizationMembers = await transaction.select({ id: authTables.member.id }).from(authTables.member)
        .where(eq(authTables.member.organizationId, organizationId));
      if (organizationMembers.length > 0) {
        await transaction.insert(businessLineMembers).values(organizationMembers.map((member) => ({
          organizationId,
          businessLineId: defaultLine.id,
          memberId: member.id,
          createdByUserId: creatorUserId,
        }))).onConflictDoNothing();
      }

      await transaction.update(pipelines).set({ businessLineId: defaultLine.id })
        .where(and(eq(pipelines.organizationId, organizationId), isNull(pipelines.businessLineId)));
      await transaction.update(messagingChannels).set({ businessLineId: defaultLine.id })
        .where(and(eq(messagingChannels.organizationId, organizationId), isNull(messagingChannels.businessLineId)));
      await transaction.update(leads).set({ businessLineId: defaultLine.id })
        .where(and(eq(leads.organizationId, organizationId), isNull(leads.businessLineId)));
    });
  }
}

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

    await backfillDefaultBusinessLines(pool);

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
