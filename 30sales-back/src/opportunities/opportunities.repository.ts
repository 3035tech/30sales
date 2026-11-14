import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lt, notInArray, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, leads, opportunities, opportunityStageHistory, people } from '../db/schema';
import { user } from '../db/auth-schema';
import { OpportunityHistoryRecordDto, OpportunityRecordDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto } from './opportunities.dto';

const owner = alias(user, 'opportunity_owner');
const historyActor = alias(user, 'opportunity_history_actor');
type OpportunityRow = { id: string; leadId: string; name: string; accountName: string; contactName: string; contactEmail: string | null; contactPhone: string | null; stage: OpportunityRecordDto['stage']; stageChangedAt: Date; ownerUserId: string | null; ownerName: string | null; amount: string | null; currency: string | null; closedAt: Date | null; lossReason: string | null; nextAction: string | null; nextActionAt: Date | null; createdAt: Date; updatedAt: Date };
function mapOpportunity(row: OpportunityRow, canUpdate = false) {
  return new OpportunityRecordDto(row.id, row.leadId, row.name, row.accountName, row.contactName, row.contactEmail, row.contactPhone, row.stage, row.stageChangedAt.toISOString(), row.ownerName, canUpdate, row.amount, row.currency, row.closedAt?.toISOString() ?? null, row.lossReason, row.nextAction, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString());
}

@Injectable()
export class OpportunitiesRepository {
  async list(input: OpportunityRepositoryListDto): Promise<OpportunityRecordDto[]> {
    const conditions: SQL[] = [eq(opportunities.organizationId, input.organizationId)];
    if (input.query.view !== 'all') conditions.push(notInArray(opportunities.stage, ['won', 'lost']));
    if (input.query.stage) conditions.push(eq(opportunities.stage, input.query.stage));
    if (input.query.view === 'mine') conditions.push(eq(opportunities.ownerUserId, input.userId));
    if (input.query.view === 'unassigned') conditions.push(isNull(opportunities.ownerUserId));
    if (input.query.view === 'no_next_action') conditions.push(isNull(opportunities.nextActionAt));
    if (input.query.view === 'overdue') conditions.push(lt(opportunities.nextActionAt, new Date()), isNull(opportunities.closedAt));
    if (input.query.view === 'stale') conditions.push(lt(opportunities.stageChangedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), isNull(opportunities.closedAt));
    const rows = await database.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, stage: opportunities.stage, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(...conditions))
      .orderBy(asc(opportunities.nextActionAt), desc(opportunities.stageChangedAt)).limit(input.query.limit).offset(input.query.offset);
    return rows.map((row) => mapOpportunity(row as OpportunityRow, input.canManageAll || (input.canEditOwned && row.ownerUserId === input.userId)));
  }

  async transition(input: OpportunityRepositoryTransitionDto): Promise<OpportunityRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ stage: opportunities.stage }).from(opportunities)
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update').limit(1);
      if (!current || current.stage !== input.input.expectedStage) return null;
      const terminal = input.input.stage === 'won' || input.input.stage === 'lost';
      const values = {
        stage: input.input.stage,
        stageChangedAt: current.stage === input.input.stage ? undefined : new Date(),
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
      await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId: updated.id, fromStage: current.stage, toStage: input.input.stage, actorUserId: input.actorUserId, reason: input.input.reason ?? input.input.lossReason ?? null });
      const [row] = await transaction.select({ id: opportunities.id, leadId: opportunities.leadId, name: opportunities.name, accountName: accounts.name, contactName: people.name, contactEmail: people.email, contactPhone: people.phone, stage: opportunities.stage, stageChangedAt: opportunities.stageChangedAt, ownerUserId: opportunities.ownerUserId, ownerName: owner.name, amount: opportunities.amount, currency: opportunities.currency, closedAt: opportunities.closedAt, lossReason: opportunities.lossReason, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt, createdAt: opportunities.createdAt, updatedAt: opportunities.updatedAt })
        .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId))).innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId))).leftJoin(owner, eq(owner.id, opportunities.ownerUserId)).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
      return row ? mapOpportunity(row as OpportunityRow, true) : null;
    });
  }

  async history(input: OpportunityRepositoryHistoryDto): Promise<OpportunityHistoryRecordDto[]> {
    const rows = await database.select({ id: opportunityStageHistory.id, fromStage: opportunityStageHistory.fromStage, toStage: opportunityStageHistory.toStage, actorName: historyActor.name, reason: opportunityStageHistory.reason, occurredAt: opportunityStageHistory.occurredAt })
      .from(opportunityStageHistory).innerJoin(opportunities, and(eq(opportunities.id, opportunityStageHistory.opportunityId), eq(opportunities.organizationId, opportunityStageHistory.organizationId)))
      .innerJoin(historyActor, eq(historyActor.id, opportunityStageHistory.actorUserId))
      .where(and(eq(opportunityStageHistory.organizationId, input.organizationId), eq(opportunityStageHistory.opportunityId, input.opportunityId))).orderBy(desc(opportunityStageHistory.occurredAt));
    return rows.map((row) => new OpportunityHistoryRecordDto(row.id, row.fromStage, row.toStage, row.actorName, row.reason, row.occurredAt.toISOString()));
  }
}
