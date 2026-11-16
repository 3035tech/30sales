import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { database, pool } from '../src/db';
import { user } from '../src/db/auth-schema';
import { PLATFORM_ADMIN_ACCOUNT_MISSING, PLATFORM_ADMIN_EMAIL_UNVERIFIED, PLATFORM_ADMIN_PROMOTION_CONFIRMATION, PLATFORM_ADMIN_PROMOTION_FAILURE, PLATFORM_ROLE } from '../src/auth/authorization.constants';

async function main() {
  try {
    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    if (process.env.PLATFORM_ADMIN_CONFIRM !== PLATFORM_ADMIN_PROMOTION_CONFIRMATION || !email) {
      throw new Error(`Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_CONFIRM=${PLATFORM_ADMIN_PROMOTION_CONFIRMATION} to promote an existing account.`);
    }
    const [account] = await database.select({ id: user.id, emailVerified: user.emailVerified, platformRole: user.platformRole }).from(user).where(eq(user.email, email)).limit(1);
    if (!account) throw new Error(PLATFORM_ADMIN_ACCOUNT_MISSING);
    if (!account.emailVerified) throw new Error(PLATFORM_ADMIN_EMAIL_UNVERIFIED);
    if (account.platformRole !== PLATFORM_ROLE.superAdmin) await database.update(user).set({ platformRole: PLATFORM_ROLE.superAdmin, updatedAt: new Date() }).where(eq(user.id, account.id));
    process.stdout.write(`Verified account ${email} has platform superadmin access.\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : PLATFORM_ADMIN_PROMOTION_FAILURE}\n`);
  process.exitCode = 1;
});
