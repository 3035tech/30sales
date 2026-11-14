import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { and, eq, gt } from 'drizzle-orm';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { organization } from 'better-auth/plugins';
import * as authTables from '../db/auth-schema';
import { database } from '../db';
import { access, roles } from './permissions';
import { sendInvitationEmail, sendVerificationEmail } from '../email/templates';
export const auth = betterAuth({
 database: drizzleAdapter(database, { provider: 'pg', schema: { user: authTables.user, session: authTables.session, account: authTables.account, verification: authTables.verification, organization: authTables.organization, member: authTables.member, invitation: authTables.invitation }, schemaName: 'auth' }),
 secret: process.env.BETTER_AUTH_SECRET, baseURL: process.env.BETTER_AUTH_URL,
 trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
 emailAndPassword: { enabled: true, autoSignIn: false, requireEmailVerification: true },
 emailVerification: { sendVerificationEmail: async ({ user, url }) => sendVerificationEmail({ user, url }), sendOnSignUp: true, autoSignInAfterVerification: true },
 plugins: [organization({ allowUserToCreateOrganization: false, ac: access, roles, requireEmailVerificationOnInvitation: true, async sendInvitationEmail(data) { await sendInvitationEmail(data); } })],
 databaseHooks: { user: { create: { before: async (user) => {
  const pending = await database.select({ id: authTables.invitation.id }).from(authTables.invitation).where(and(eq(authTables.invitation.email, user.email), eq(authTables.invitation.status, 'pending'), gt(authTables.invitation.expiresAt, new Date()))).limit(1);
  if (pending.length === 0) throw new APIError('FORBIDDEN', { message: 'An active organization invitation is required to create an account' });
  return { data: user };
 } } } },
 advanced: { database: { generateId: 'uuid' } },
});
