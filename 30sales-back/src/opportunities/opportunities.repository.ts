import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, notInArray, or, SQL, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, activities, auditEvents, leads, opportunities, opportunityStageHistory, people, pipelineStages, pipelines, userNotifications } from '../db/schema';
import { member, user } from '../db/auth-schema';
import { OpportunityAssigneeDto, OpportunityHistoryRecordDto, type OpportunityLastActivityDto, OpportunityPageDto, OpportunityPipelineSummaryDto, OpportunityRecordDto, OpportunityRepositoryAssignOwnerDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto } from './opportunities.dto';
import { ORGANIZATION_CLOSER_ROLES } from '../auth/authorization.constants';

const owner = alias(user, 'opportunity_owner');
const historyActor = alias(user, 'opportunity_history_actor');
const customStage = alias(pipelineStages, 'opportunity_custom_stage');
const pipelineOrderStage = alias(pipelineStages, 'opportunity_order_stage');
const fromCustomStage = alias(pipelineStages, 'history_from_custom_stage');
const toCustomStage = alias(pipelineStages, 'history_to_custom_stage');
type OpportunityRow = { id: string; leadId: string; name: string; accountName: string; contactName: string; contactEmail: string | null; contactPhone: string | null; pipelineId: string; stage: OpportunityRecordDto['stage']; pipelineStageKey: string | null; pipelineStageName: string | null; stageChangedAt: Date; ownerUserId: string | null; ownerName: string | null; amount: string | null; currency: string | null; closedAt: Date | null; lossReason: string | null; nextAction: string | null; nextActionAt: Date | null; createdAt: Date; updatedAt: Date; latestActivity?: Omit<OpportunityLastActivityDto, 'occurredAt'> & { occurredAt: Date } | null };
function mapOpportunity(row: OpportunityRow, canUpdate = false) {
  const lastActivity = row.latestActivity ? { ...row.latestActivity, occurredAt: row.latestActivity.occurredAt.toISOString() } : null;
  return new OpportunityRecordDto(row.id, row.leadId, row.name, row.accountName, row.contactName, row.contactEmail, row.contactPhone, row.pipelineId, row.stage, row.pipelineStageKey, row.pipelineStageName, row.stageChangedAt.toISOString(), row.ownerUserId, row.ownerName, canUpdate, row.amount, row.currency, row.closedAt?.toISOString() ?? null, row.lossReason, row.nextAction, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString(), lastActivity);
}

@Injectable()
export class OpportunitiesRepository {
  private conditions(input: OpportunityRepositoryListDto): SQL[] {
    const conditions: SQL[] = [eq(opportunities.organizationId, input.organizationId)];
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

  private async selectRows(input: OpportunityRepositoryListDto, conditions: SQL[]) {
    const sortColumn = input.query.sortBy === 'accountName' ? accounts.name
      : input.query.sortBy === 'contactName' ? people.name
        : input.query.sortBy === 'stageChangedAt' ? opportunities.stageChangedAt
          : input.query.sortBy === 'opportunityName' ? opportunities.name
          : input.query.sortBy === 'stage' ? pipelineOrderStage.position
              : input.query.sortBy === 'ownerName' ? owner.name
                : opportunities.nextActionAt;
    const direction = input.query.sortDirection === 'desc' ? desc : asc;
    const rows = await database.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey)))
      .leftJoin(pipelineOrderStage, and(eq(pipelineOrderStage.organizationId, opportunities.organizationId), eq(pipelineOrderStage.pipelineId, opportunities.pipelineId), sql`case when ${opportunities.stage} = 'custom' then ${pipelineOrderStage.key} = ${opportunities.pipelineStageKey} else ${pipelineOrderStage.stage} = ${opportunities.stage} end`))
      .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...conditions))
      .orderBy(direction(sortColumn), asc(opportunities.id)).limit(input.query.limit).offset(input.query.offset);
    if (rows.length === 0) return rows as OpportunityRow[];
    const latestActivities = await database.selectDistinctOn([activities.opportunityId], { opportunityId: activities.opportunityId, type: activities.type, subject: activities.subject, result: activities.result, occurredAt: activities.occurredAt })
      .from(activities)
      .where(and(eq(activities.organizationId, input.organizationId), inArray(activities.opportunityId, rows.map((row) => row.id))))
      .orderBy(activities.opportunityId, desc(activities.occurredAt), desc(activities.createdAt));
    const activityByOpportunity = new Map(latestActivities.map((activity) => [activity.opportunityId, { type: activity.type, subject: activity.subject, result: activity.result, occurredAt: activity.occurredAt }]));
    return rows.map((row) => ({ ...row, latestActivity: activityByOpportunity.get(row.id) ?? null })) as OpportunityRow[];
  }

  async list(input: OpportunityRepositoryListDto): Promise<OpportunityRecordDto[]> {
    const rows = await this.selectRows(input, this.conditions(input));
    return rows.map((row) => mapOpportunity(row as OpportunityRow, input.canManageAll || (input.canEditOwned && row.ownerUserId === input.userId)));
  }

  async page(input: OpportunityRepositoryListDto): Promise<OpportunityPageDto> {
    const conditions = this.conditions(input);
    const [rows, totalRows] = await Promise.all([
      this.selectRows(input, conditions),
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...conditions)),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const data = rows.map((row) => mapOpportunity(row as OpportunityRow, input.canManageAll || (input.canEditOwned && row.ownerUserId === input.userId)));
    return new OpportunityPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async summary(input: OpportunityRepositoryListDto): Promise<OpportunityPipelineSummaryDto> {
    const conditions = this.conditions({ ...input, query: { ...input.query, opportunityId: undefined, limit: 1, offset: 0 } });
    const openConditions = [...conditions, notInArray(opportunities.stage, ['won', 'lost'])];
    const riskConditions = [...openConditions, or(isNull(opportunities.nextActionAt), lt(opportunities.nextActionAt, new Date()), lt(opportunities.stageChangedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))!];
    const [openRows, riskRows, valueRows, stageRows] = await Promise.all([
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...openConditions)),
      database.select({ total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...riskConditions)),
      database.select({ currency: opportunities.currency, amount: sum(opportunities.amount) }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
        .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...openConditions, isNotNull(opportunities.currency), isNotNull(opportunities.amount))).groupBy(opportunities.currency),
      database.select({ stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, total: count() }).from(opportunities)
        .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
        .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
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
    const rows = await database.select({ id: user.id, name: user.name }).from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, organizationId), sql`string_to_array(replace(${member.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`))
      .orderBy(asc(user.name));
    return rows.map((row) => new OpportunityAssigneeDto(row.id, row.name));
  }

  async assignOwner(input: OpportunityRepositoryAssignOwnerDto): Promise<OpportunityRecordDto | 'invalid_assignee' | 'terminal_opportunity' | null> {
    const opportunityId = await database.transaction(async (transaction): Promise<string | 'invalid_assignee' | null> => {
      const [current] = await transaction.select({ ownerUserId: opportunities.ownerUserId, stage: opportunities.stage }).from(opportunities)
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return null;
      if (current.stage === 'won' || current.stage === 'lost') return 'terminal_opportunity';
      if (input.ownerUserId) {
        const [eligible] = await transaction.select({ id: member.id }).from(member)
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
    const [row] = await database.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey)))
      .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
    return row ? mapOpportunity(row as OpportunityRow, true) : null;
  }

  async transition(input: OpportunityRepositoryTransitionDto): Promise<OpportunityRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey }).from(opportunities)
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update').limit(1);
      if (!current || current.stage !== input.input.expectedStage || current.pipelineStageKey !== (input.input.expectedPipelineStageKey ?? null) || (input.input.expectedPipelineId && current.pipelineId !== input.input.expectedPipelineId)) return null;
      const targetPipelineId = input.input.pipelineId ?? current.pipelineId;
      if (!targetPipelineId) return null;
      const [targetPipeline] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, targetPipelineId), eq(pipelines.isActive, true))).for('share').limit(1);
      if (!targetPipeline) return null;
      if (input.input.stage === 'custom') {
        const [target] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, targetPipelineId), eq(pipelineStages.key, input.input.pipelineStageKey!), eq(pipelineStages.stage, 'custom'), eq(pipelineStages.isActive, true), eq(pipelineStages.isSystem, false))).for('share').limit(1);
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
        closedAt: input.input.stage === 'won' && input.input.closedAt ? new Date(input.input.closedAt) : null,
        lossReason: input.input.stage === 'lost' ? input.input.lossReason ?? null : null,
      };
      const conditions = [eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(opportunities.stage, current.stage)];
      if (!input.canManageAll) conditions.push(eq(opportunities.ownerUserId, input.actorUserId));
      const [updated] = await transaction.update(opportunities).set(values).where(and(...conditions)).returning({ id: opportunities.id });
      if (!updated) return null;
      await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId: updated.id, fromStage: current.stage, fromPipelineId: current.pipelineId, fromPipelineStageKey: current.pipelineStageKey, toStage: input.input.stage, toPipelineId: targetPipelineId, toPipelineStageKey: input.input.pipelineStageKey ?? null, actorUserId: input.actorUserId, reason: input.input.reason ?? input.input.lossReason ?? null });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: current.pipelineId === targetPipelineId ? 'opportunity.stage_changed' : 'opportunity.pipeline_changed', entityType: 'opportunity', entityId: updated.id, correlationId: input.correlationId, beforeState: { pipelineId: current.pipelineId, stage: current.stage, pipelineStageKey: current.pipelineStageKey }, afterState: { pipelineId: targetPipelineId, stage: input.input.stage, pipelineStageKey: input.input.pipelineStageKey ?? null } });
      const [row] = await transaction.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, pipelineId: opportunities.pipelineId, stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: customStage.name, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
        .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId))).innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId))).leftJoin(customStage, and(eq(customStage.organizationId, opportunities.organizationId), eq(customStage.pipelineId, opportunities.pipelineId), eq(customStage.key, opportunities.pipelineStageKey))).leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
      return row ? mapOpportunity(row as OpportunityRow, true) : null;
    });
  }

  async history(input: OpportunityRepositoryHistoryDto): Promise<OpportunityHistoryRecordDto[]> {
    const rows = await database.select({ id: opportunityStageHistory.id, fromStage: opportunityStageHistory.fromStage, fromPipelineStageKey: opportunityStageHistory.fromPipelineStageKey, fromPipelineStageName: fromCustomStage.name, toStage: opportunityStageHistory.toStage, toPipelineStageKey: opportunityStageHistory.toPipelineStageKey, toPipelineStageName: toCustomStage.name, actorName: historyActor.name, reason: opportunityStageHistory.reason, occurredAt: opportunityStageHistory.occurredAt })
      .from(opportunityStageHistory).innerJoin(opportunities, and(eq(opportunities.id, opportunityStageHistory.opportunityId), eq(opportunities.organizationId, opportunityStageHistory.organizationId)))
      .innerJoin(historyActor, eq(historyActor.id, opportunityStageHistory.actorUserId))
      .leftJoin(fromCustomStage, and(eq(fromCustomStage.organizationId, opportunityStageHistory.organizationId), eq(fromCustomStage.key, opportunityStageHistory.fromPipelineStageKey)))
      .leftJoin(toCustomStage, and(eq(toCustomStage.organizationId, opportunityStageHistory.organizationId), eq(toCustomStage.key, opportunityStageHistory.toPipelineStageKey)))
      .where(and(eq(opportunityStageHistory.organizationId, input.organizationId), eq(opportunityStageHistory.opportunityId, input.opportunityId), input.canManageAll ? undefined : eq(opportunities.ownerUserId, input.userId))).orderBy(desc(opportunityStageHistory.occurredAt));
    return rows.map((row) => new OpportunityHistoryRecordDto(row.id, row.fromStage, row.fromPipelineStageKey, row.fromPipelineStageName, row.toStage, row.toPipelineStageKey, row.toPipelineStageName, row.actorName, row.reason, row.occurredAt.toISOString()));
  }
}
