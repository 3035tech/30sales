import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import * as auth from '../src/db/auth-schema';
import * as schema from '../src/db/schema';

const expectedOrganizationName = 'Acme Brasil (dados de demonstração)';
const expectedDatabaseName = '30sales';
const expectedDatabasePort = '55432';
const email = 'ux.demo@30sales.test';
const name = 'UX Demo';

function stableUuid(organizationId: string, key: string) {
  const bytes = createHash('sha1').update(`30sales:ui-demo-v1:${organizationId}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  const databaseUrl = process.env.DEMO_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DEMO_DATABASE_URL to the local UX demo database.');
  if (process.env.NODE_ENV === 'production') throw new Error('A UX demo account cannot be created in production.');
  if (process.env.DEMO_ACCOUNT_CONFIRM !== 'CREATE_LOCAL_UX_DEMO_ACCOUNT') throw new Error('Set DEMO_ACCOUNT_CONFIRM=CREATE_LOCAL_UX_DEMO_ACCOUNT to confirm this local account creation.');
  const target = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.port !== expectedDatabasePort || target.pathname !== `/${expectedDatabaseName}`) {
    throw new Error(`Refusing non-demo database target. Expected a loopback connection to ${expectedDatabaseName} on port ${expectedDatabasePort}.`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  const database = drizzle(pool, { schema: { ...auth, ...schema } });
  try {
    const [organization] = await database.select({ id: auth.organization.id }).from(auth.organization)
      .where(eq(auth.organization.name, expectedOrganizationName)).limit(1);
    if (!organization) throw new Error('The UX demo organization was not found.');
    const markerId = stableUuid(organization.id, 'dataset-marker');
    const [marker] = await database.select({ id: schema.auditEvents.id }).from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, organization.id), eq(schema.auditEvents.id, markerId))).limit(1);
    if (!marker) throw new Error('The ui-demo-v1 dataset must exist before adding its login.');

    const [existingUser] = await database.select({ id: auth.user.id, name: auth.user.name }).from(auth.user).where(eq(auth.user.email, email)).limit(1);
    if (existingUser) {
      const [membership] = await database.select({ id: auth.member.id }).from(auth.member)
        .where(and(eq(auth.member.organizationId, organization.id), eq(auth.member.userId, existingUser.id))).limit(1);
      const [credential] = await database.select({ id: auth.account.id }).from(auth.account)
        .where(and(eq(auth.account.userId, existingUser.id), eq(auth.account.providerId, 'credential'))).limit(1);
      if (existingUser.name !== name || !membership || !credential) {
        throw new Error(`Refusing to modify the existing account ${email}; it is not the UX demo account created by this seed.`);
      }
      process.stdout.write(`The UX demo account already exists and is linked to ${expectedOrganizationName}.\nEmail: ${email}\nPassword: unchanged (see the local session context).\n`);
      return;
    }

    const userId = randomUUID();
    const accountId = randomUUID();
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await hashPassword(password);
    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction.insert(auth.user).values({ id: userId, name, email, emailVerified: true, createdAt: now, updatedAt: now });
      await transaction.insert(auth.account).values({ id: accountId, accountId: userId, providerId: 'credential', userId, password: passwordHash, createdAt: now, updatedAt: now });
      await transaction.insert(auth.member).values({ organizationId: organization.id, userId, role: 'owner', createdAt: now });
      await transaction.insert(schema.auditEvents).values({ organizationId: organization.id, actorUserId: userId, actorType: 'user', action: 'demo.account.created', entityType: 'user', entityId: userId, afterState: { email, role: 'owner', source: 'ui-demo-v1' } });
    });
    process.stdout.write(`UX demo account created for ${expectedOrganizationName}.\nEmail: ${email}\nPassword: ${password}\nRole: owner\nThe account is joined to the existing ui-demo-v1 tenant; existing demo records were preserved.\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unable to create the UX demo account.'}\n`);
  process.exitCode = 1;
});
