import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lt, notInArray, or, SQL, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, activities, auditEvents, businessLineMembers, businessLines, leads, opportunities, opportunityConversationContexts, opportunityProposals, opportunityStageHistory, people, pipelineStages, pipelines, userNotifications } from '../db/schema';
import { member, user } from '../db/auth-schema';
import { OpportunityAssigneeDto, OpportunityHistoryRecordDto, type OpportunityConversationContextDto, type OpportunityLastActivityDto, OpportunityProposalDto, OpportunityConversationContextsQueryDto, OpportunityPageDto, OpportunityPipelineSummaryDto, OpportunityRecordDto, OpportunityRepositoryAssignOwnerDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto, type ProposalInputDto } from './opportunities.dto';
import { ORGANIZATION_CLOSER_ROLES } from '../auth/authorization.constants';

const owner = alias(user, 'opportunity_owner');
const creator = alias(user, 'opportunity_creator');
const historyActor = alias(user, 'opportunity_history_actor');
const customStage = alias(pipelineStages, 'opportunity_custom_stage');
const pipelineOrderStage = alias(pipelineStages, 'opportunity_order_stage');
const fromCustomStage = alias(pipelineStages, 'history_from_custom_stage');
const toCustomStage = alias(pipelineStages, 'history_to_custom_stage');
type OpportunityRow = { id: string; leadId: string; name: string; accountName: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null; pipelineId: string | null; stage: OpportunityRecordDto['stage']; pipelineStageKey: string | null; pipelineStageName: string | null; stageChangedAt: Date; ownerUserId: string | null; ownerName: string | null; createdByType: OpportunityRecordDto['createdByType']; createdByName: string | null; amount: string | null; currency: string | null; closedAt: Date | null; lossReason: string | null; nextAction: string | null; nextActionAt: Date | null; createdAt: Date; updatedAt: Date; latestActivity?: Omit<OpportunityLastActivityDto, 'occurredAt'> & { occurredAt: Date } | null };
function mapOpportunity(row: OpportunityRow, canUpdate = false) {
  if (!row.pipelineId) throw new Error('Opportunity pipeline is not initialized');
  const lastActivity = row.latestActivity ? { ...row.latestActivity, occurredAt: row.latestActivity.occurredAt.toISOString() } : null;
  return new OpportunityRecordDto(row.id, row.leadId, row.name, row.accountName, row.contactName, row.contactEmail, row.contactPhone, row.pipelineId, row.stage, row.pipelineStageKey, row.pipelineStageName, row.stageChangedAt.toISOString(), row.ownerUserId, row.ownerName, row.createdByType, row.createdByName, canUpdate, row.amount, row.currency, row.closedAt?.toISOString() ?? null, row.lossReason, row.nextAction, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString(), lastActivity);
}

@Injectable()
export class OpportunitiesRepository {
  async createProposal(input: { organizationId: string; opportunityId: string; userId: string; canManageAll: boolean; values: ProposalInputDto; fileName: string; mimeType: string; fileSize: number; storageKey: string; correlationId?: string }): Promise<OpportunityProposalDto | null> {
    return database.transaction(async (transaction) => {
      const [opportunity] = await transaction.select({ id: opportunities.id, ownerUserId: opportunities.ownerUserId, businessLineId: pipelines.businessLineId, stage: opportunities.stage }).from(opportunities)
        .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
        .innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(businessLines.status, 'active')))
        .for('update', { of: [opportunities] }).limit(1);
      if (!opportunity || (!input.canManageAll && (opportunity.ownerUserId !== input.userId || !await this.lockLineMembership(transaction, input.organizationId, opportunity.businessLineId, input.userId)))) return null;
      const [last] = await transaction.select({ version: opportunityProposals.version }).from(opportunityProposals)
        .where(and(eq(opportunityProposals.organizationId, input.organizationId), eq(opportunityProposals.opportunityId, input.opportunityId)))
        .orderBy(desc(opportunityProposals.version)).limit(1);
      const [actor] = await transaction.select({ name: user.name }).from(user).where(eq(user.id, input.userId)).limit(1);
      const [proposal] = await transaction.insert(opportunityProposals).values({ organizationId: input.organizationId, opportunityId: input.opportunityId, version: (last?.version ?? 0) + 1, amount: input.values.amount, currency: input.values.currency, billingTerm: input.values.billingTerm, sentAt: new Date(input.values.sentAt), fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, storageKey: input.storageKey, createdByUserId: input.userId }).returning();
      await transaction.update(opportunities).set({ quotedAmount: input.values.amount, quotedCurrency: input.values.currency, quotedAt: new Date(input.values.sentAt), updatedAt: new Date() }).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId)));
      await transaction.insert(activities).values({ organizationId: input.organizationId, opportunityId: input.opportunityId, type: 'email', subject: `Proposal v${proposal.version} sent`, details: `${input.fileName} · ${input.values.billingTerm} · ${input.values.currency} ${input.values.amount}`, occurredAt: new Date(input.values.sentAt), createdByUserId: input.userId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'opportunity.proposal_recorded', entityType: 'opportunity', entityId: input.opportunityId, correlationId: input.correlationId, beforeState: null, afterState: { proposalId: proposal.id, version: proposal.version, amount: proposal.amount, currency: proposal.currency, billingTerm: proposal.billingTerm } });
      return new OpportunityProposalDto(proposal.id, proposal.version, proposal.amount, proposal.currency, proposal.billingTerm as OpportunityProposalDto['billingTerm'], proposal.sentAt.toISOString(), proposal.fileName, proposal.fileSize, actor?.name ?? '', proposal.createdAt.toISOString());
    });
  }

  async listProposals(input: { organizationId: string; opportunityId: string; userId: string; canManageAll: boolean }): Promise<OpportunityProposalDto[] | null> {
    const conditions = [eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId)];
    if (!input.canManageAll) conditions.push(eq(opportunities.ownerUserId, input.userId), this.lineMembershipCondition(input.organizationId, input.userId));
    const [accessible] = await database.select({ id: opportunities.id }).from(opportunities).innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId))).innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId))).where(and(...conditions, eq(businessLines.status, 'active'))).limit(1);
    if (!accessible) return null;
    const rows = await database.select({ id: opportunityProposals.id, version: opportunityProposals.version, amount: opportunityProposals.amount, currency: opportunityProposals.currency, billingTerm: opportunityProposals.billingTerm, sentAt: opportunityProposals.sentAt, fileName: opportunityProposals.fileName, fileSize: opportunityProposals.fileSize, createdAt: opportunityProposals.createdAt, createdByName: user.name }).from(opportunityProposals).innerJoin(user, eq(user.id, opportunityProposals.createdByUserId)).where(and(eq(opportunityProposals.organizationId, input.organizationId), eq(opportunityProposals.opportunityId, input.opportunityId))).orderBy(desc(opportunityProposals.version));
    return rows.map((row) => new OpportunityProposalDto(row.id, row.version, row.amount, row.currency, row.billingTerm as OpportunityProposalDto['billingTerm'], row.sentAt.toISOString(), row.fileName, row.fileSize, row.createdByName, row.createdAt.toISOString()));
  }

  async proposalContent(input: { organizationId: string; opportunityId: string; proposalId: string; userId: string; canManageAll: boolean; correlationId?: string }) {
    const conditions = [eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(opportunityProposals.id, input.proposalId), eq(opportunityProposals.organizationId, input.organizationId)];
    if (!input.canManageAll) conditions.push(eq(opportunities.ownerUserId, input.userId), this.lineMembershipCondition(input.organizationId, input.userId));
    const [row] = await database.select({ storageKey: opportunityProposals.storageKey, fileName: opportunityProposals.fileName, mimeType: opportunityProposals.mimeType }).from(opportunityProposals).innerJoin(opportunities, and(eq(opportunities.id, opportunityProposals.opportunityId), eq(opportunities.organizationId, opportunityProposals.organizationId))).innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId))).innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId))).where(and(...conditions, eq(businessLines.status, 'active'))).limit(1);
    if (!row) return null;
    await database.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'opportunity.proposal_downloaded', entityType: 'opportunity', entityId: input.opportunityId, correlationId: input.correlationId, afterState: { proposalId: input.proposalId } });
    return row;
  }
  private conditions(input: OpportunityRepositoryListDto): SQL[] {
    const conditions: SQL[] = [eq(opportunities.organizationId, input.organizationId)];
    if (input.accessibleBusinessLineIds) conditions.push(inArray(opportunities.pipelineId, database.select({ id: pipelines.id }).from(pipelines).where(and(eq(pipelines.organizationId, input.organizationId), inArray(pipelines.businessLineId, input.accessibleBusinessLineIds)))));
    if (input.query.businessLineId) conditions.push(inArray(opportunities.pipelineId, database.select({ id: pipelines.id }).from(pipelines).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.businessLineId, input.query.businessLineId)))));
    if (input.query.opportunityId) conditions.push(eq(opportunities.id, input.query.opportunityId));
    if (input.query.pipelineId) conditions.push(eq(opportunities.pipelineId, input.query.pipelineId));
    if (input.query.view !== 'all') conditions.push(notInArray(opportunities.stage, ['won', 'lost']));
    if (input.query.stage) conditions.push(eq(opportunities.stage, input.query.stage));
    if (input.query.pipelineStageKey) conditions.push(eq(opportunities.pipelineStageKey, input.query.pipelineStageKey));
    if (input.query.assignedToUserId === 'unassigned') conditions.push(isNull(opportunities.ownerUserId));
    else if (input.query.assignedToUserId) conditions.push(eq(opportunities.ownerUserId, input.query.assignedToUserId));
    if (input.query.noNextAction) conditions.push(isNull(opportunities.nextActionAt));
    if (input.query.dueAfter) conditions.push(gte(opportunities.nextActionAt, new Date(input.query.dueAfter)));
    if (input.query.dueBefore) conditions.push(lt(opportunities.nextActionAt, new Date(input.query.dueBefore)));
    if (input.query.view === 'mine') conditions.push(eq(opportunities.ownerUserId, input.userId));
    if (input.query.view === 'unassigned') conditions.push(isNull(opportunities.ownerUserId));
    if (input.query.view === 'no_next_action') conditions.push(isNull(opportunities.nextActionAt));
    if (input.query.view === 'overdue') conditions.push(lt(opportunities.nextActionAt, new Date()), isNull(opportunities.closedAt));
    if (input.query.view === 'stale') conditions.push(lt(opportunities.stageChangedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), isNull(opportunities.closedAt));
    if (input.query.search) {
      const pattern = `%${input.query.search}%`;
      conditions.push(or(ilike(accounts.name, pattern), ilike(people.name, pattern), ilike(people.email, pattern), ilike(people.phone, pattern), ilike(opportunities.name, pattern), ilike(opportunities.nextAction, pattern), ilike(owner.name, pattern))!);
    }
    return conditions;
  }

  async canAccessOpportunity(organizationId: string, opportunityId: string, userId: string, canManageAll: boolean): Promise<boolean> {
    const base = database.select({ id: opportunities.id }).from(opportunities)
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
      .where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.id, opportunityId), eq(businessLines.status, 'active')));
    if (canManageAll) return (await base.limit(1)).length > 0;
    const rows = await database.select({ id: opportunities.id }).from(opportunities)
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
      .innerJoin(businessLineMembers, and(eq(businessLineMembers.organizationId, pipelines.organizationId), eq(businessLineMembers.businessLineId, pipelines.businessLineId)))
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
      .where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.id, opportunityId), eq(member.userId, userId), eq(businessLines.status, 'active'))).limit(1);
    return rows.length > 0;
  }

  private async selectRows(input: OpportunityRepositoryListDto, conditions: SQL[]) {
    const sortColumn = input.query.sortBy === 'accountName' ? accounts.name
      : input.query.sortBy === 'contactName' ? people.name
        : input.query.sortBy === 'stageChangedAt' ? opportunities.stageChangedAt
          : input.query.sortBy === 'opportunityName' ? opportunities.name
          : input.query.sortBy === 'stage' ? pipelineOrderStage.position
              : input.query.sortBy === 'ownerName' ? owner.name
                : opportunities.nextActionAt;
    const direction = input.query.sortDirection === 'desc' ? desc : asc;
    const rows = await database.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, createdByType: opportunities.createdByType, createdByName: creator.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey)))
      .leftJoin(pipelineOrderStage, and(eq(pipelineOrderStage.organizationId, opportunities.organizationId), eq(pipelineOrderStage.pipelineId, opportunities.pipelineId), sql`case when ${opportunities.stage} = 'custom' then ${pipelineOrderStage.key} = ${opportunities.pipelineStageKey} else ${pipelineOrderStage.stage} = ${opportunities.stage} end`))
      .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).leftJoin(creator, eq(creator.id, opportunities.createdByUserId)).where(and(...conditions))
      .orderBy(direction(sortColumn), asc(opportunities.id)).limit(input.query.limit).offset(input.query.offset);
    if (rows.length === 0) return rows;
    const latestActivities = await database.selectDistinctOn([activities.opportunityId], { opportunityId: activities.opportunityId, type: activities.type, subject: activities.subject, result: activities.result, occurredAt: activities.occurredAt })
      .from(activities)
      .where(and(eq(activities.organizationId, input.organizationId), inArray(activities.opportunityId, rows.map((row) => row.id))))
      .orderBy(activities.opportunityId, desc(activities.occurredAt), desc(activities.createdAt));
    const activityByOpportunity = new Map(latestActivities.map((activity) => [activity.opportunityId, { type: activity.type, subject: activity.subject, result: activity.result, occurredAt: activity.occurredAt }]));
    return rows.map((row) => ({ ...row, latestActivity: activityByOpportunity.get(row.id) ?? null }));
  }

  async conversationContexts(input: OpportunityConversationContextsQueryDto): Promise<OpportunityConversationContextDto[] | null> {
    const opportunityConditions = [eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId)];
    if (!input.canManageAll) opportunityConditions.push(eq(opportunities.ownerUserId, input.userId));
    if (!input.canManageAll) opportunityConditions.push(this.lineMembershipCondition(input.organizationId, input.userId));
    const [opportunity] = await database.select({ id: opportunities.id }).from(opportunities)
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
      .where(and(...opportunityConditions, eq(businessLines.status, 'active'))).limit(1);
    if (!opportunity) return null;
    const rows = await database.select({ conversationId: opportunityConversationContexts.conversationId, summary: opportunityConversationContexts.summary, confirmedFacts: opportunityConversationContexts.confirmedFacts, unknowns: opportunityConversationContexts.unknowns, capturedAt: opportunityConversationContexts.capturedAt })
      .from(opportunityConversationContexts)
      .where(and(eq(opportunityConversationContexts.organizationId, input.organizationId), eq(opportunityConversationContexts.opportunityId, opportunity.id)))
      .orderBy(desc(opportunityConversationContexts.capturedAt));
    return rows.map((row) => ({ ...row, capturedAt: row.capturedAt.toISOString() }));
  }

  private lineMembershipCondition(organizationId: string, userId: string): SQL {
    return exists(database.select({ id: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId), eq(pipelines.businessLineId, businessLineMembers.businessLineId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(member.userId, userId), eq(businessLines.status, 'active'))));
  }

  private async lockLineMembership(transaction: Parameters<Parameters<typeof database.transaction>[0]>[0], organizationId: string, businessLineId: string | null, userId: string): Promise<boolean> {
    if (!businessLineId) return false;
    const [membership] = await transaction.select({ businessLineId: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, businessLineId), eq(member.userId, userId), eq(businessLines.status, 'active')))
      .for('share', { of: [businessLineMembers, businessLines] }).limit(1);
    return Boolean(membership);
  }

  async list(input: OpportunityRepositoryListDto): Promise<OpportunityRecordDto[]> {
    const rows = await this.selectRows(input, this.conditions(input));
    return rows.map((row) => mapOpportunity(row, input.canManageAll || (input.canEditOwned && row.ownerUserId === input.userId)));
  }

  async page(input: OpportunityRepositoryListDto): Promise<OpportunityPageDto> {
    const conditions = this.conditions(input);
    const [rows, totalRows] = await Promise.all([
      this.selectRows(input, conditions),
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...conditions)),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const data = rows.map((row) => mapOpportunity(row, input.canManageAll || (input.canEditOwned && row.ownerUserId === input.userId)));
    return new OpportunityPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async summary(input: OpportunityRepositoryListDto): Promise<OpportunityPipelineSummaryDto> {
    const conditions = this.conditions({ ...input, query: { ...input.query, opportunityId: undefined, limit: 1, offset: 0 } });
    const openConditions = [...conditions, notInArray(opportunities.stage, ['won', 'lost'])];
    const riskConditions = [...openConditions, or(isNull(opportunities.nextActionAt), lt(opportunities.nextActionAt, new Date()), lt(opportunities.stageChangedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))!];
    const [openRows, riskRows, valueRows, stageRows] = await Promise.all([
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...openConditions)),
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...riskConditions)),
      database.select({ currency: opportunities.currency, amount: sum(opportunities.amount) }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...openConditions, isNotNull(opportunities.currency), isNotNull(opportunities.amount))).groupBy(opportunities.currency),
      database.select({ stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...conditions)).groupBy(opportunities.stage, opportunities.pipelineStageKey),
    ]);
    return new OpportunityPipelineSummaryDto(
      openRows[0]?.total ?? 0,
      riskRows[0]?.total ?? 0,
      valueRows.flatMap((row) => row.currency && row.amount ? [{ currency: row.currency, amount: row.amount }] : []),
      stageRows.map((row) => ({ stage: row.stage, pipelineStageKey: row.pipelineStageKey, count: row.total })),
    );
  }

  async listAssignees(organizationId: string): Promise<OpportunityAssigneeDto[]> {
    const rows = await database.select({ id: user.id, name: user.name, businessLineId: businessLineMembers.businessLineId }).from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .innerJoin(businessLineMembers, and(eq(businessLineMembers.memberId, member.id), eq(businessLineMembers.organizationId, member.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(member.organizationId, organizationId), eq(businessLines.status, 'active'), sql`string_to_array(replace(${member.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`))
      .orderBy(asc(user.name), asc(businessLineMembers.businessLineId));
    const assignees = new Map<string, { name: string; businessLineIds: string[] }>();
    for (const row of rows) {
      const existing = assignees.get(row.id);
      if (existing) existing.businessLineIds.push(row.businessLineId);
      else assignees.set(row.id, { name: row.name, businessLineIds: [row.businessLineId] });
    }
    return [...assignees].map(([id, assignee]) => new OpportunityAssigneeDto(id, assignee.name, assignee.businessLineIds));
  }

  async assignOwner(input: OpportunityRepositoryAssignOwnerDto): Promise<OpportunityRecordDto | 'invalid_assignee' | 'terminal_opportunity' | null> {
    const opportunityId = await database.transaction(async (transaction): Promise<string | 'invalid_assignee' | null> => {
      const [current] = await transaction.select({ ownerUserId: opportunities.ownerUserId, stage: opportunities.stage, businessLineId: pipelines.businessLineId }).from(opportunities)
        .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
        .innerJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(businessLines.status, 'active'))).for('update').limit(1);
      if (!current) return null;
      if (current.stage === 'won' || current.stage === 'lost') return 'terminal_opportunity';
      if (input.ownerUserId) {
        if (!current.businessLineId) return 'invalid_assignee';
        const [eligible] = await transaction.select({ id: member.id }).from(member)
          .innerJoin(businessLineMembers, and(eq(businessLineMembers.memberId, member.id), eq(businessLineMembers.organizationId, member.organizationId), eq(businessLineMembers.businessLineId, current.businessLineId)))
          .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.ownerUserId), sql`string_to_array(replace(${member.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`)).limit(1);
        if (!eligible) return 'invalid_assignee';
      }
      if (current.ownerUserId === input.ownerUserId) return input.opportunityId;
      const [updated] = await transaction.update(opportunities).set({ ownerUserId: input.ownerUserId, updatedAt: new Date() })
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).returning({ id: opportunities.id });
      if (!updated) return null;
      const [auditEvent] = await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'opportunity.owner_changed', entityType: 'opportunity', entityId: input.opportunityId, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId }, afterState: { ownerUserId: input.ownerUserId } }).returning({ id: auditEvents.id });
      if (input.ownerUserId && input.ownerUserId !== input.actorUserId) await transaction.insert(userNotifications).values({ organizationId: input.organizationId, recipientUserId: input.ownerUserId, opportunityId: input.opportunityId, notificationType: 'opportunity_assigned', idempotencyKey: `opportunity-assigned:${auditEvent.id}` }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
      return updated.id;
    });
    if (opportunityId === 'invalid_assignee') return opportunityId;
    if (opportunityId === 'terminal_opportunity') return opportunityId;
    return opportunityId ? this.findAssignedOpportunity(input) : null;
  }

  private async findAssignedOpportunity(input: OpportunityRepositoryAssignOwnerDto): Promise<OpportunityRecordDto | null> {
    const [row] = await database.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, createdByType: opportunities.createdByType, createdByName: creator.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey)))
      .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).leftJoin(creator, eq(creator.id, opportunities.createdByUserId)).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
    return row ? mapOpportunity(row, true) : null;
  }

  async transition(input: OpportunityRepositoryTransitionDto): Promise<OpportunityRecordDto | null | 'different_business_line'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ pipelineId: opportunities.pipelineId, businessLineId: pipelines.businessLineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey }).from(opportunities)
        .leftJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update', { of: [opportunities] }).limit(1);
      if (!current || current.stage !== input.input.expectedStage || current.pipelineStageKey !== (input.input.expectedPipelineStageKey ?? null) || (input.input.expectedPipelineId && current.pipelineId !== input.input.expectedPipelineId)) return null;
      if (!input.canManageAll && !await this.lockLineMembership(transaction, input.organizationId, current.businessLineId, input.actorUserId)) return null;
      const targetPipelineId = input.input.pipelineId ?? current.pipelineId;
      if (!targetPipelineId) return null;
      const [targetPipeline] = await transaction.select({ id: pipelines.id, businessLineId: pipelines.businessLineId }).from(pipelines)
        .leftJoin(businessLines, and(eq(businessLines.id, pipelines.businessLineId), eq(businessLines.organizationId, pipelines.organizationId)))
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, targetPipelineId), eq(pipelines.isActive, true), or(isNull(pipelines.businessLineId), eq(businessLines.status, 'active')))).for('share', { of: [pipelines] }).limit(1);
      if (!targetPipeline) return null;
      if (targetPipeline.businessLineId !== current.businessLineId) return 'different_business_line';
      if (input.input.stage === 'custom') {
        const pipelineStageKey = input.input.pipelineStageKey;
        if (!pipelineStageKey) return null;
        const [target] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, targetPipelineId), eq(pipelineStages.key, pipelineStageKey), eq(pipelineStages.stage, 'custom'), eq(pipelineStages.isActive, true), eq(pipelineStages.isSystem, false))).for('share').limit(1);
        if (!target) return null;
      } else {
        const [target] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, targetPipelineId), eq(pipelineStages.stage, input.input.stage), eq(pipelineStages.isActive, true), eq(pipelineStages.isSystem, true))).for('share').limit(1);
        if (!target) return null;
      }
      const terminal = input.input.stage === 'won' || input.input.stage === 'lost';
      const values = {
        pipelineId: targetPipelineId,
        stage: input.input.stage,
        pipelineStageKey: input.input.pipelineStageKey ?? null,
        stageChangedAt: current.pipelineId === targetPipelineId && current.stage === input.input.stage && current.pipelineStageKey === (input.input.pipelineStageKey ?? null) ? undefined : new Date(),
        updatedAt: new Date(),
        nextAction: terminal ? null : input.input.nextAction ?? null,
        nextActionAt: terminal ? null : input.input.nextActionAt ? new Date(input.input.nextActionAt) : null,
        amount: input.input.amount,
        currency: input.input.currency,
        quotedAmount: input.input.stage === 'proposal_sent' && input.input.amount ? input.input.amount : undefined,
        quotedCurrency: input.input.stage === 'proposal_sent' && input.input.amount ? input.input.currency : undefined,
        quotedAt: input.input.stage === 'proposal_sent' && input.input.amount ? new Date() : undefined,
        closedAt: input.input.stage === 'won' && input.input.closedAt ? new Date(input.input.closedAt) : null,
        lossReason: input.input.stage === 'lost' ? input.input.lossReason ?? null : null,
      };
      const conditions = [eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(opportunities.stage, current.stage)];
      if (!input.canManageAll) conditions.push(eq(opportunities.ownerUserId, input.actorUserId), this.lineMembershipCondition(input.organizationId, input.actorUserId));
      const [updated] = await transaction.update(opportunities).set(values).where(and(...conditions)).returning({ id: opportunities.id });
      if (!updated) return null;
      await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId: updated.id, fromStage: current.stage, fromPipelineId: current.pipelineId, fromPipelineStageKey: current.pipelineStageKey, toStage: input.input.stage, toPipelineId: targetPipelineId, toPipelineStageKey: input.input.pipelineStageKey ?? null, actorUserId: input.actorUserId, reason: input.input.reason ?? input.input.lossReason ?? null });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: current.pipelineId === targetPipelineId ? 'opportunity.stage_changed' : 'opportunity.pipeline_changed', entityType: 'opportunity', entityId: updated.id, correlationId: input.correlationId, beforeState: { pipelineId: current.pipelineId, stage: current.stage, pipelineStageKey: current.pipelineStageKey }, afterState: { pipelineId: targetPipelineId, stage: input.input.stage, pipelineStageKey: input.input.pipelineStageKey ?? null } });
      const [row] = await transaction.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, createdByType: opportunities.createdByType, createdByName: creator.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
        .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId))).leftJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId))).leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey))).leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).leftJoin(creator, eq(creator.id, opportunities.createdByUserId)).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
      return row ? mapOpportunity(row, true) : null;
    });
  }

  async history(input: OpportunityRepositoryHistoryDto): Promise<OpportunityHistoryRecordDto[]> {
    const rows = await database.select({ id: opportunityStageHistory.id, fromStage: opportunityStageHistory.fromStage, fromPipelineStageKey: opportunityStageHistory.fromPipelineStageKey, fromPipelineStageName: fromCustomStage.name, toStage: opportunityStageHistory.toStage, toPipelineStageKey: opportunityStageHistory.toPipelineStageKey, toPipelineStageName: toCustomStage.name, actorName: historyActor.name, reason: opportunityStageHistory.reason, occurredAt: opportunityStageHistory.occurredAt })
      .from(opportunityStageHistory).innerJoin(opportunities, and(eq(opportunities.id, opportunityStageHistory.opportunityId), eq(opportunities.organizationId, opportunityStageHistory.organizationId)))
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
      .innerJoin(historyActor, eq(historyActor.id, opportunityStageHistory.actorUserId))
      .leftJoin(fromCustomStage, and(eq(fromCustomStage.organizationId, opportunityStageHistory.organizationId), eq(fromCustomStage.key, opportunityStageHistory.fromPipelineStageKey)))
      .leftJoin(toCustomStage, and(eq(toCustomStage.organizationId, opportunityStageHistory.organizationId), eq(toCustomStage.key, opportunityStageHistory.toPipelineStageKey)))
      .where(and(eq(opportunityStageHistory.organizationId, input.organizationId), eq(opportunityStageHistory.opportunityId, input.opportunityId), input.canManageAll ? undefined : and(eq(opportunities.ownerUserId, input.userId), this.lineMembershipCondition(input.organizationId, input.userId)))).orderBy(desc(opportunityStageHistory.occurredAt));
    return rows.map((row) => new OpportunityHistoryRecordDto(row.id, row.fromStage, row.fromPipelineStageKey, row.fromPipelineStageName, row.toStage, row.toPipelineStageKey, row.toPipelineStageName, row.actorName, row.reason, row.occurredAt.toISOString()));
  }
}
