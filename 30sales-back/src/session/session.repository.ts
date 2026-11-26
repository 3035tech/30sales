import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { database } from '../db';
import { invitation, member, organization, user } from '../db/auth-schema';
import { AUTH_INVITATION_STATUS } from '../auth/authorization.constants';

@Injectable()
export class SessionRepository {
  async findActiveInvitationPreview(invitationId: string, organizationId?: string) {
    const [record] = await database.select({ id: invitation.id, email: invitation.email, role: invitation.role, organizationName: organization.name })
      .from(invitation).innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(and(eq(invitation.id, invitationId), organizationId ? eq(invitation.organizationId, organizationId) : undefined, eq(invitation.status, AUTH_INVITATION_STATUS.pending), gt(invitation.expiresAt, new Date())))
      .limit(1);
    return record?.role ? record : null;
  }

  async findUserPlatformRole(userId: string) {
    const [record] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
    return record ?? null;
  }

  async findOrganization(organizationId: string) {
    const [record] = await database.select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization).where(eq(organization.id, organizationId)).limit(1);
    return record ?? null;
  }

  async findMembershipRole(userId: string, organizationId: string) {
    const [record] = await database.select({ role: member.role }).from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1);
    return record?.role ?? null;
  }
}
