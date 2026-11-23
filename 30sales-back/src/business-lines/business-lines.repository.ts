import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, businessLineMembers, businessLines } from '../db/schema';
import { member, organization as authOrganization, user } from '../db/auth-schema';
import { AUDIT_ACTOR_TYPE } from '../auth/authorization.constants';
import { BusinessLineCreateCommandDto, BusinessLineListDto, BusinessLineMemberDto, BusinessLineMembersCommandDto, BusinessLineMembersDto, BusinessLineRecordDto, BusinessLineUpdateCommandDto } from './business-lines.dto';

@Injectable()
export class BusinessLinesRepository {
  async list(organizationId: string, userId: string, canManage: boolean): Promise<BusinessLineListDto> {
    const memberCount = count(businessLineMembers.memberId).mapWith(Number);
    const query = database.select({ id: businessLines.id, name: businessLines.name, slug: businessLines.slug, description: businessLines.description, status: businessLines.status, isDefault: businessLines.isDefault, memberCount, createdAt: businessLines.createdAt })
      .from(businessLines)
      .leftJoin(businessLineMembers, and(eq(businessLineMembers.organizationId, businessLines.organizationId), eq(businessLineMembers.businessLineId, businessLines.id)));
    const rows = canManage
      ? await query.where(eq(businessLines.organizationId, organizationId)).groupBy(businessLines.id).orderBy(asc(businessLines.name), asc(businessLines.id))
      : await database.select({ id: businessLines.id, name: businessLines.name, slug: businessLines.slug, description: businessLines.description, status: businessLines.status, isDefault: businessLines.isDefault, memberCount, createdAt: businessLines.createdAt })
        .from(businessLines)
        .innerJoin(businessLineMembers, and(eq(businessLineMembers.organizationId, businessLines.organizationId), eq(businessLineMembers.businessLineId, businessLines.id)))
        .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLines.organizationId), eq(member.userId, userId)))
        .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.status, 'active'))).groupBy(businessLines.id).orderBy(asc(businessLines.name), asc(businessLines.id));
    return new BusinessLineListDto(rows.map((row) => new BusinessLineRecordDto(row.id, row.name, row.slug, row.description, row.status, row.isDefault, row.memberCount, row.createdAt.toISOString())));
  }

  async create(input: BusinessLineCreateCommandDto): Promise<BusinessLineRecordDto | 'duplicate_slug' | 'creator_not_member'> {
    return database.transaction(async (transaction) => {
      const [organization] = await transaction.select({ id: authOrganization.id }).from(authOrganization)
        .where(eq(authOrganization.id, input.organizationId)).for('update').limit(1);
      if (!organization) return 'creator_not_member';
      const [actorMembership] = await transaction.select({ id: member.id }).from(member)
        .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorUserId))).limit(1);
      if (!actorMembership && !input.isPlatformOrganizationContext) return 'creator_not_member';
      const [existingDefault] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.isDefault, true))).limit(1);
      const isDefault = !existingDefault;
      const [line] = await transaction.insert(businessLines).values({ organizationId: input.organizationId, name: input.input.name, slug: input.input.slug, description: input.input.description, isDefault, createdByUserId: input.actorUserId })
        .onConflictDoNothing({ target: [businessLines.organizationId, businessLines.slug] }).returning();
      if (!line) return 'duplicate_slug';
      if (actorMembership) await transaction.insert(businessLineMembers).values({ organizationId: input.organizationId, businessLineId: line.id, memberId: actorMembership.id, createdByUserId: input.actorUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: 'business_line.created', entityType: 'business_line', entityId: line.id, correlationId: input.correlationId, afterState: { name: line.name, slug: line.slug, initialMemberUserIds: actorMembership ? [input.actorUserId] : [] } });
      return new BusinessLineRecordDto(line.id, line.name, line.slug, line.description, 'active', line.isDefault, actorMembership ? 1 : 0, line.createdAt.toISOString());
    });
  }

  async update(input: BusinessLineUpdateCommandDto): Promise<BusinessLineRecordDto | 'not_found' | 'duplicate_slug' | 'archived' | 'last_active_line' | 'invalid_transition'> {
    return database.transaction(async (transaction) => {
      const [line] = await transaction.select().from(businessLines)
        .where(and(eq(businessLines.id, input.businessLineId), eq(businessLines.organizationId, input.organizationId))).for('update').limit(1);
      if (!line) return 'not_found';
      if (line.status === 'archived') return 'archived';
      const nextStatus = input.input.status ?? line.status;
      if (nextStatus === 'archived' && line.status === 'active') return 'invalid_transition';
      if (input.input.slug && input.input.slug !== line.slug) {
        const [duplicate] = await transaction.select({ id: businessLines.id }).from(businessLines)
          .where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.slug, input.input.slug))).limit(1);
        if (duplicate) return 'duplicate_slug';
      }
      if (line.isDefault && nextStatus !== 'active') {
        const activeLines = await transaction.select({ id: businessLines.id }).from(businessLines)
          .where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.status, 'active'))).limit(2);
        const nextDefault = activeLines.find((candidate) => candidate.id !== line.id);
        if (!nextDefault) return 'last_active_line';
        await transaction.update(businessLines).set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(businessLines.id, line.id), eq(businessLines.organizationId, input.organizationId)));
        await transaction.update(businessLines).set({ isDefault: true, updatedAt: new Date() })
          .where(and(eq(businessLines.id, nextDefault.id), eq(businessLines.organizationId, input.organizationId)));
      }
      const [updated] = await transaction.update(businessLines).set({
        ...(input.input.name !== undefined ? { name: input.input.name } : {}),
        ...(input.input.slug !== undefined ? { slug: input.input.slug } : {}),
        ...(input.input.description !== undefined ? { description: input.input.description } : {}),
        status: nextStatus,
        updatedAt: new Date(),
      }).where(and(eq(businessLines.id, input.businessLineId), eq(businessLines.organizationId, input.organizationId))).returning();
      if (!updated) return 'not_found';
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: 'business_line.updated', entityType: 'business_line', entityId: updated.id, correlationId: input.correlationId, beforeState: { name: line.name, slug: line.slug, description: line.description, status: line.status, isDefault: line.isDefault }, afterState: { name: updated.name, slug: updated.slug, description: updated.description, status: updated.status, isDefault: updated.isDefault } });
      const [memberCount] = await transaction.select({ value: count() }).from(businessLineMembers)
        .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, updated.id)));
      return new BusinessLineRecordDto(updated.id, updated.name, updated.slug, updated.description, updated.status, updated.isDefault, Number(memberCount?.value ?? 0), updated.createdAt.toISOString());
    });
  }

  async listMembers(organizationId: string, businessLineId: string): Promise<BusinessLineMembersDto | null> {
    const [line] = await database.select({ id: businessLines.id }).from(businessLines).where(and(eq(businessLines.id, businessLineId), eq(businessLines.organizationId, organizationId))).limit(1);
    if (!line) return null;
    const rows = await database.select({ userId: user.id, name: user.name, email: user.email, role: member.role })
      .from(businessLineMembers)
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, businessLineId)))
      .orderBy(asc(user.name), asc(user.id));
    return new BusinessLineMembersDto(rows.map((row) => new BusinessLineMemberDto(row.userId, row.name, row.email, row.role)));
  }

  async setMembers(input: BusinessLineMembersCommandDto): Promise<BusinessLineMembersDto | 'not_found' | 'invalid_members' | 'archived'> {
    return database.transaction(async (transaction) => {
      const [line] = await transaction.select({ id: businessLines.id, status: businessLines.status }).from(businessLines)
        .where(and(eq(businessLines.id, input.businessLineId), eq(businessLines.organizationId, input.organizationId))).for('update').limit(1);
      if (!line) return 'not_found';
      if (line.status === 'archived') return 'archived';
      const existingMembers = input.memberUserIds.length === 0 ? [] : await transaction.select({ id: member.id, userId: member.userId })
        .from(member).where(and(eq(member.organizationId, input.organizationId), inArray(member.userId, input.memberUserIds)));
      if (existingMembers.length !== input.memberUserIds.length) return 'invalid_members';
      const previous = await transaction.select({ userId: member.userId }).from(businessLineMembers)
        .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
        .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, input.businessLineId)));
      await transaction.delete(businessLineMembers).where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, input.businessLineId)));
      const now = new Date();
      if (existingMembers.length > 0) await transaction.insert(businessLineMembers).values(existingMembers.map((organizationMember) => ({ organizationId: input.organizationId, businessLineId: input.businessLineId, memberId: organizationMember.id, createdByUserId: input.actorUserId, createdAt: now })));
      const assignedUserIds = [...input.memberUserIds].sort();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: 'business_line.members_updated', entityType: 'business_line', entityId: input.businessLineId, correlationId: input.correlationId, beforeState: { userIds: previous.map((row) => row.userId).sort() }, afterState: { userIds: assignedUserIds } });
      const rows = await transaction.select({ userId: user.id, name: user.name, email: user.email, role: member.role })
        .from(businessLineMembers)
        .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
        .innerJoin(user, eq(user.id, member.userId))
        .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, input.businessLineId)))
        .orderBy(asc(user.name), asc(user.id));
      return new BusinessLineMembersDto(rows.map((row) => new BusinessLineMemberDto(row.userId, row.name, row.email, row.role)));
    });
  }
}
