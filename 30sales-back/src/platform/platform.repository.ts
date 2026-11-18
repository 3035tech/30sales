import { Injectable } from '@nestjs/common';
import { asc, count, eq, ilike, or } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents } from '../db/schema';
import { invitation, member, organization, user } from '../db/auth-schema';
import { AUDIT_ACTOR_TYPE, AUTH_INVITATION_STATUS, ORGANIZATION_ROLE, PLATFORM_AUDIT_ACTION, PLATFORM_AUDIT_ENTITY_TYPE, PLATFORM_ORGANIZATION_SLUG_UNIQUE_VIOLATION, PLATFORM_OWNER_INVITATION_VALIDITY_DAYS, PLATFORM_ROLE } from '../auth/authorization.constants';
import { PlatformOrganizationListDto, PlatformOrganizationRecordDto, type CreatePlatformOrganizationDto, type ListPlatformOrganizationsQueryDto } from './platform.dto';

type CreatedPlatformOrganization = { organization: PlatformOrganizationRecordDto; invitationId: string };

@Injectable()
export class PlatformRepository {
  async isSuperAdmin(userId: string): Promise<boolean> {
    const [account] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
    return account?.platformRole === PLATFORM_ROLE.superAdmin;
  }

  async recordOrganizationAccess(organizationId: string, actor: { userId: string }, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [selectedOrganization] = await transaction.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
      if (!selectedOrganization) return false;
      await transaction.insert(auditEvents).values({
        organizationId: selectedOrganization.id,
        actorUserId: actor.userId,
        actorType: AUDIT_ACTOR_TYPE.user,
        action: PLATFORM_AUDIT_ACTION.organizationAccessed,
        entityType: PLATFORM_AUDIT_ENTITY_TYPE.platformAccess,
        entityId: selectedOrganization.id,
        correlationId,
        afterState: { accessMode: 'super_admin_support', selectionSource: 'platform_console' },
      });
      return true;
    });
  }

  async listOrganizations(query: ListPlatformOrganizationsQueryDto): Promise<PlatformOrganizationListDto> {
    const memberCount = count(member.id).mapWith(Number);
    const conditions = query.search ? or(ilike(organization.name, `%${query.search}%`), ilike(organization.slug, `%${query.search}%`)) : undefined;
    const [rows, [totals]] = await Promise.all([database.select({ id: organization.id, name: organization.name, slug: organization.slug, memberCount, createdAt: organization.createdAt })
      .from(organization).leftJoin(member, eq(member.organizationId, organization.id))
      .where(conditions).groupBy(organization.id).orderBy(asc(organization.name), asc(organization.id)).limit(query.limit).offset(query.offset),
      database.select({ total: count().mapWith(Number) }).from(organization).where(conditions)]);
    const data = rows.map((row) => new PlatformOrganizationRecordDto(row.id, row.name, row.slug, row.memberCount, row.createdAt.toISOString()));
    const total = totals?.total ?? 0;
    return new PlatformOrganizationListDto(data, { limit: query.limit, offset: query.offset, total, hasNextPage: query.offset + data.length < total });
  }

  async createOrganization(input: CreatePlatformOrganizationDto, actor: { userId: string; name: string; email: string }, correlationId: string | null): Promise<CreatedPlatformOrganization | null> {
    try {
      return await database.transaction(async (transaction) => {
        const [existing] = await transaction.select({ id: organization.id }).from(organization).where(eq(organization.slug, input.slug)).limit(1);
        if (existing) return null;
        const now = new Date();
        const [createdOrganization] = await transaction.insert(organization).values({ name: input.name, slug: input.slug, createdAt: now }).returning({ id: organization.id, name: organization.name, slug: organization.slug, createdAt: organization.createdAt });
        const expiresAt = new Date(now.getTime() + PLATFORM_OWNER_INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
        const [ownerInvitation] = await transaction.insert(invitation).values({ organizationId: createdOrganization.id, email: input.ownerEmail.toLowerCase(), role: ORGANIZATION_ROLE.owner, status: AUTH_INVITATION_STATUS.pending, expiresAt, inviterId: actor.userId }).returning({ id: invitation.id });
        await transaction.insert(auditEvents).values([
          { organizationId: createdOrganization.id, actorUserId: actor.userId, actorType: AUDIT_ACTOR_TYPE.user, action: PLATFORM_AUDIT_ACTION.organizationCreated, entityType: PLATFORM_AUDIT_ENTITY_TYPE.organization, entityId: createdOrganization.id, correlationId, afterState: { name: createdOrganization.name, slug: createdOrganization.slug, createdByPlatformAdmin: true } },
          { organizationId: createdOrganization.id, actorUserId: actor.userId, actorType: AUDIT_ACTOR_TYPE.user, action: PLATFORM_AUDIT_ACTION.invitationCreated, entityType: PLATFORM_AUDIT_ENTITY_TYPE.invitation, entityId: ownerInvitation.id, correlationId, afterState: { role: ORGANIZATION_ROLE.owner, status: AUTH_INVITATION_STATUS.pending, expiresAt: expiresAt.toISOString() } },
        ]);
        return { organization: new PlatformOrganizationRecordDto(createdOrganization.id, createdOrganization.name, createdOrganization.slug, 0, createdOrganization.createdAt.toISOString()), invitationId: ownerInvitation.id };
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === PLATFORM_ORGANIZATION_SLUG_UNIQUE_VIOLATION) return null;
      throw error;
    }
  }
}
