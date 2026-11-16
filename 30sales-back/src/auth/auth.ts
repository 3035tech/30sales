import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { Logger } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { organization } from 'better-auth/plugins';
import * as authTables from '../db/auth-schema';
import { database } from '../db';
import { access, roles } from './permissions';
import { sendInvitationEmail, sendPasswordResetEmail, sendVerificationEmail } from '../email/templates';
import { AuditRepository } from '../audit/audit.repository';
import { requestContext } from '../common/request-context';
import { PLATFORM_ROLE } from './authorization.constants';
import { authSecondaryStorage } from './auth-redis.service';
const auditRepository = new AuditRepository();
const authLogger = new Logger('Auth');
export const auth = betterAuth({
 database: drizzleAdapter(database, { provider: 'pg', schema: { user: authTables.user, session: authTables.session, account: authTables.account, verification: authTables.verification, organization: authTables.organization, member: authTables.member, invitation: authTables.invitation }, schemaName: 'auth' }),
 ...(authSecondaryStorage ? { secondaryStorage: authSecondaryStorage, session: { storeSessionInDatabase: true } } : {}),
 user: { additionalFields: { platformRole: { type: 'string', required: false, input: false, defaultValue: PLATFORM_ROLE.user } } },
 secret: process.env.BETTER_AUTH_SECRET, baseURL: process.env.BETTER_AUTH_URL,
 trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:5173'],
 emailAndPassword: { enabled: true, autoSignIn: false, requireEmailVerification: true, revokeSessionsOnPasswordReset: true, sendResetPassword: async ({ user, url }) => { void sendPasswordResetEmail({ user, url }).catch(() => authLogger.error('Password reset email delivery failed')); } },
 emailVerification: { sendVerificationEmail: async ({ user, url }) => sendVerificationEmail({ user, url }), sendOnSignUp: true, autoSignInAfterVerification: true },
 plugins: [organization({ allowUserToCreateOrganization: false, ac: access, roles, requireEmailVerificationOnInvitation: true, async sendInvitationEmail(data) { await sendInvitationEmail(data); }, organizationHooks: {
  afterCreateInvitation: async ({ invitation, inviter, organization }) => auditRepository.record({ organizationId: organization.id, actorUserId: inviter.id, action: 'invitation.created', entityType: 'invitation', entityId: invitation.id, correlationId: requestContext.getStore()?.correlationId ?? null, afterState: { role: invitation.role, status: invitation.status } }),
  afterAcceptInvitation: async ({ invitation, user, member, organization }) => auditRepository.record({ organizationId: organization.id, actorUserId: user.id, action: 'invitation.accepted', entityType: 'invitation', entityId: invitation.id, correlationId: requestContext.getStore()?.correlationId ?? null, beforeState: { status: 'pending' }, afterState: { status: invitation.status, memberId: member.id, role: member.role } }),
  afterCancelInvitation: async ({ invitation, cancelledBy, organization }) => auditRepository.record({ organizationId: organization.id, actorUserId: cancelledBy.id, action: 'invitation.cancelled', entityType: 'invitation', entityId: invitation.id, correlationId: requestContext.getStore()?.correlationId ?? null, beforeState: { status: 'pending' }, afterState: { status: invitation.status } }),
 } })],
 databaseHooks: { user: { create: { before: async (user) => {
  const pending = await database.select({ id: authTables.invitation.id }).from(authTables.invitation).where(and(eq(authTables.invitation.email, user.email), eq(authTables.invitation.status, 'pending'), gt(authTables.invitation.expiresAt, new Date()))).limit(1);
  if (pending.length === 0) throw new APIError('FORBIDDEN', { message: 'An active organization invitation is required to create an account' });
  return { data: user };
 } } } },
 advanced: { database: { generateId: 'uuid' } },
});
