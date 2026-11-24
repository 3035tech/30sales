import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, inArray, ilike, lt, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { assistantRuns, auditEvents, platformAuditEvents, platformEvolutionConfiguration } from '../db/schema';
import { invitation, member, organization, user } from '../db/auth-schema';
import { AUDIT_ACTOR_TYPE, AUTH_INVITATION_STATUS, ORGANIZATION_INVITATION_VALIDITY_DAYS, ORGANIZATION_ROLE, PLATFORM_AUDIT_ACTION, PLATFORM_AUDIT_ENTITY_TYPE, PLATFORM_ORGANIZATION_SLUG_UNIQUE_VIOLATION, PLATFORM_ROLE } from '../auth/authorization.constants';
import { PLATFORM_AI_USAGE_AUDIT_ACTIONS, PLATFORM_AI_USAGE_AUDIT_OPERATIONS, PLATFORM_AI_USAGE } from './platform.constants';
import { PlatformAiUsagePointDto, PlatformAuditEventDto, PlatformEvolutionConfigurationDto, PlatformOrganizationListDto, PlatformOrganizationMembersDto, PlatformOrganizationRecordDto, type CreatePlatformOrganizationDto, type CreatePlatformOrganizationInvitationDto, type ListPlatformOrganizationsQueryDto, type PlatformAiUsageQueryDto, type PlatformAuditQueryDto, type SavePlatformEvolutionConfigurationDto } from './platform.dto';

type CreatedPlatformOrganization = { organization: PlatformOrganizationRecordDto; invitationId: string };

@Injectable()
export class PlatformRepository {
  async listOrganizationMembers(organizationId: string): Promise<PlatformOrganizationMembersDto | null> {
    const [selectedOrganization] = await database.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
    if (!selectedOrganization) return null;
    const rows = await database.select({ id: member.id, role: member.role, userId: user.id, name: user.name, email: user.email })
      .from(member).innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId)).orderBy(asc(user.name), asc(user.id));
    return new PlatformOrganizationMembersDto(rows.map((row) => ({ id: row.id, role: row.role, user: { id: row.userId, name: row.name, email: row.email } })));
  }

  async createOrganizationInvitation(organizationId: string, input: CreatePlatformOrganizationInvitationDto, actorUserId: string, correlationId: string | null): Promise<{ invitationId: string; email: string; organizationName: string } | 'not_found' | 'already_invited'> {
    const now = new Date();
    const email = input.email.toLowerCase();
    const result = await database.transaction(async (transaction) => {
      const [selectedOrganization] = await transaction.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.id, organizationId)).for('update').limit(1);
      if (!selectedOrganization) return 'not_found' as const;
      const [existingInvitation] = await transaction.select({ id: invitation.id }).from(invitation)
        .where(and(eq(invitation.organizationId, organizationId), eq(invitation.email, email), eq(invitation.status, AUTH_INVITATION_STATUS.pending), gt(invitation.expiresAt, now))).limit(1);
      if (existingInvitation) return 'already_invited' as const;
      const expiresAt = new Date(now.getTime() + ORGANIZATION_INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
      const [createdInvitation] = await transaction.insert(invitation).values({ organizationId, email, role: input.role, status: AUTH_INVITATION_STATUS.pending, expiresAt, inviterId: actorUserId }).returning({ id: invitation.id });
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: PLATFORM_AUDIT_ACTION.invitationCreated, entityType: PLATFORM_AUDIT_ENTITY_TYPE.invitation, entityId: createdInvitation.id, correlationId, afterState: { role: input.role, status: AUTH_INVITATION_STATUS.pending, expiresAt: expiresAt.toISOString(), createdByPlatformAdmin: true } });
      return { invitationId: createdInvitation.id, organizationName: selectedOrganization.name };
    });
    if (result === 'not_found' || result === 'already_invited') return result;
    return { ...result, email };
  }

  async aiUsage(query: PlatformAiUsageQueryDto): Promise<PlatformAiUsagePointDto[]> {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const runOperation = assistantRuns.operation;
    const runRows = database.select({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      operation: runOperation,
      model: assistantRuns.modelKey,
      requestCount: count().mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${assistantRuns.usageInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${assistantRuns.usageOutputTokens}), 0)::int`,
      estimatedCostUsd: sql<string | null>`sum(${assistantRuns.estimatedCostUsd})::text`,
      unpricedRequestCount: sql<number>`count(*) filter (where ${assistantRuns.estimatedCostUsd} is null)::int`,
    }).from(assistantRuns).innerJoin(organization, eq(organization.id, assistantRuns.organizationId))
      .where(and(gte(assistantRuns.startedAt, from), lt(assistantRuns.startedAt, toExclusive)))
      .groupBy(organization.id, organization.name, organization.slug, runOperation, assistantRuns.modelKey);

    const auditModel = sql<string>`coalesce(${auditEvents.afterState}->>'model', ${PLATFORM_AI_USAGE.unknownModel})`;
    const inputTokens = sql<number>`coalesce(sum(case when ${auditEvents.afterState}->>'usageInputTokens' ~ ${PLATFORM_AI_USAGE.jsonIntegerPattern} then (${auditEvents.afterState}->>'usageInputTokens')::integer else 0 end), 0)::int`;
    const outputTokens = sql<number>`coalesce(sum(case when ${auditEvents.afterState}->>'usageOutputTokens' ~ ${PLATFORM_AI_USAGE.jsonIntegerPattern} then (${auditEvents.afterState}->>'usageOutputTokens')::integer else 0 end), 0)::int`;
    const estimatedCost = sql<string | null>`sum(case when ${auditEvents.afterState}->>'estimatedCostUsd' ~ ${PLATFORM_AI_USAGE.jsonDecimalPattern} then (${auditEvents.afterState}->>'estimatedCostUsd')::numeric else null end)::text`;
    const auditRows = database.select({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      action: auditEvents.action,
      model: auditModel,
      requestCount: count().mapWith(Number),
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimatedCost,
      unpricedRequestCount: sql<number>`coalesce(sum(case when ${auditEvents.afterState}->>'estimatedCostUsd' ~ ${PLATFORM_AI_USAGE.jsonDecimalPattern} then 0 else 1 end), 0)::int`,
    }).from(auditEvents).innerJoin(organization, eq(organization.id, auditEvents.organizationId))
      .where(and(gte(auditEvents.occurredAt, from), lt(auditEvents.occurredAt, toExclusive), inArray(auditEvents.action, PLATFORM_AI_USAGE_AUDIT_ACTIONS)))
      .groupBy(organization.id, organization.name, organization.slug, auditEvents.action, auditModel);

    const [automated, audited] = await Promise.all([runRows, auditRows]);
    return [
      ...automated.map((row) => new PlatformAiUsagePointDto(row.organizationId, row.organizationName, row.organizationSlug, row.operation, row.model, row.requestCount, Number(row.inputTokens), Number(row.outputTokens), row.estimatedCostUsd, Number(row.unpricedRequestCount))),
      ...audited.map((row) => {
        const operation = Object.values(PLATFORM_AI_USAGE_AUDIT_OPERATIONS).find((candidate) => candidate.action === row.action)?.operation ?? PLATFORM_AI_USAGE_AUDIT_OPERATIONS.qualificationSuggestions.operation;
        return new PlatformAiUsagePointDto(row.organizationId, row.organizationName, row.organizationSlug, operation, row.model, row.requestCount, Number(row.inputTokens), Number(row.outputTokens), row.estimatedCostUsd, Number(row.unpricedRequestCount));
      }),
    ];
  }

  async getEvolutionConfiguration(): Promise<PlatformEvolutionConfigurationDto> {
    const [row] = await database.select({ displayName: platformEvolutionConfiguration.displayName, baseUrl: platformEvolutionConfiguration.baseUrl, updatedAt: platformEvolutionConfiguration.updatedAt }).from(platformEvolutionConfiguration).where(eq(platformEvolutionConfiguration.id, 'default')).limit(1);
    return new PlatformEvolutionConfigurationDto(Boolean(row), row?.displayName ?? null, row?.baseUrl ?? null, row?.updatedAt.toISOString() ?? null);
  }

  async saveEvolutionConfiguration(input: SavePlatformEvolutionConfigurationDto, encrypted: { ciphertext: string; iv: string; authTag: string }, actorUserId: string, correlationId: string | null): Promise<PlatformEvolutionConfigurationDto> {
    const baseUrl = input.baseUrl.replace(/\/+$/, '');
    return database.transaction(async (transaction) => {
      const [previous] = await transaction.select({ displayName: platformEvolutionConfiguration.displayName, baseUrl: platformEvolutionConfiguration.baseUrl })
        .from(platformEvolutionConfiguration).where(eq(platformEvolutionConfiguration.id, 'default')).limit(1);
      const updatedAt = new Date();
      const [row] = await transaction.insert(platformEvolutionConfiguration).values({ id: 'default', displayName: input.displayName, baseUrl, credentialsCiphertext: encrypted.ciphertext, credentialsIv: encrypted.iv, credentialsAuthTag: encrypted.authTag, updatedByUserId: actorUserId, updatedAt })
        .onConflictDoUpdate({ target: platformEvolutionConfiguration.id, set: { displayName: input.displayName, baseUrl, credentialsCiphertext: encrypted.ciphertext, credentialsIv: encrypted.iv, credentialsAuthTag: encrypted.authTag, updatedByUserId: actorUserId, updatedAt } })
        .returning({ displayName: platformEvolutionConfiguration.displayName, baseUrl: platformEvolutionConfiguration.baseUrl, updatedAt: platformEvolutionConfiguration.updatedAt });
      await transaction.insert(platformAuditEvents).values({
        actorUserId,
        action: PLATFORM_AUDIT_ACTION.evolutionConfigurationUpdated,
        entityType: PLATFORM_AUDIT_ENTITY_TYPE.platformIntegration,
        entityId: 'evolution',
        correlationId,
        beforeState: previous ? { displayName: previous.displayName, baseUrl: previous.baseUrl } : null,
        afterState: { displayName: row.displayName, baseUrl: row.baseUrl },
        occurredAt: row.updatedAt,
      });
      return new PlatformEvolutionConfigurationDto(true, row.displayName, row.baseUrl, row.updatedAt.toISOString());
    });
  }

  async getEvolutionCredentials(): Promise<{ baseUrl: string; ciphertext: string; iv: string; authTag: string } | null> {
    const [row] = await database.select({ baseUrl: platformEvolutionConfiguration.baseUrl, ciphertext: platformEvolutionConfiguration.credentialsCiphertext, iv: platformEvolutionConfiguration.credentialsIv, authTag: platformEvolutionConfiguration.credentialsAuthTag }).from(platformEvolutionConfiguration).where(eq(platformEvolutionConfiguration.id, 'default')).limit(1);
    return row ?? null;
  }

  async listEvolutionAudit(query: PlatformAuditQueryDto): Promise<PlatformAuditEventDto[]> {
    const rows = await database.select({ id: platformAuditEvents.id, action: platformAuditEvents.action, actorName: user.name, beforeState: platformAuditEvents.beforeState, afterState: platformAuditEvents.afterState, occurredAt: platformAuditEvents.occurredAt })
      .from(platformAuditEvents).leftJoin(user, eq(user.id, platformAuditEvents.actorUserId))
      .where(and(eq(platformAuditEvents.entityType, PLATFORM_AUDIT_ENTITY_TYPE.platformIntegration), eq(platformAuditEvents.entityId, 'evolution')))
      .orderBy(desc(platformAuditEvents.occurredAt), desc(platformAuditEvents.id)).limit(query.limit).offset(query.offset);
    return rows.map((row) => new PlatformAuditEventDto(row.id, row.action, row.actorName, row.beforeState ?? null, row.afterState ?? null, row.occurredAt.toISOString()));
  }

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
        const expiresAt = new Date(now.getTime() + ORGANIZATION_INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
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
