import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, auditEvents, handoffHistory, handoffs, leadStatusHistory, leads, opportunities, opportunityStageHistory, people, tasks } from '../db/schema';
import { user } from '../db/auth-schema';
import { HandoffRecordDto, HandoffRepositoryAcceptDto, HandoffRepositoryCreateDto, HandoffRepositoryListDto, HandoffRepositoryReturnDto, HandoffStatus } from './handoffs.dto';

const requester = alias(user, 'handoff_requester');
const closer = alias(user, 'handoff_closer');
type HandoffRow = { id: string; opportunityId: string; leadId: string; opportunityName: string; accountName: string; contactName: string; status: 'requested' | 'accepted' | 'returned' | 'cancelled'; reason: string; evidence: string; confirmedFacts: string[]; unknowns: string[]; nextStep: string; nextStepAt: Date; requestedByName: string; closerName: string | null; returnReason: string | null; requestedAt: Date };
function mapHandoff(row: HandoffRow): HandoffRecordDto {
  return new HandoffRecordDto(row.id, row.opportunityId, row.leadId, row.opportunityName, row.accountName, row.contactName, row.status as HandoffStatus, row.reason, row.evidence, row.confirmedFacts, row.unknowns, row.nextStep, row.nextStepAt.toISOString(), row.requestedByName, row.closerName, row.returnReason, row.requestedAt.toISOString());
}

@Injectable()
export class HandoffsRepository {
  private async getRecord(organizationId: string, handoffId: string): Promise<HandoffRecordDto | null> {
    const [row] = await database.select({ id: handoffs.id, opportunityId: handoffs.opportunityId, leadId: opportunities.leadId, opportunityName: opportunities.name, accountName: accounts.name, contactName: people.name, status: handoffs.status, reason: handoffs.reason, evidence: handoffs.evidence, confirmedFacts: handoffs.confirmedFacts, unknowns: handoffs.unknowns, nextStep: handoffs.nextStep, nextStepAt: handoffs.nextStepAt, requestedByName: requester.name, closerName: closer.name, returnReason: handoffs.returnReason, requestedAt: handoffs.requestedAt })
      .from(handoffs).innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .innerJoin(requester, eq(requester.id, handoffs.requestedByUserId)).leftJoin(closer, eq(closer.id, handoffs.acceptedByUserId))
      .where(and(eq(handoffs.id, handoffId), eq(handoffs.organizationId, organizationId))).limit(1);
    return row ? mapHandoff(row as HandoffRow) : null;
  }

  async list(input: HandoffRepositoryListDto): Promise<HandoffRecordDto[]> {
    const rows = await database.select({ id: handoffs.id, opportunityId: handoffs.opportunityId, leadId: opportunities.leadId, opportunityName: opportunities.name, accountName: accounts.name, contactName: people.name, status: handoffs.status, reason: handoffs.reason, evidence: handoffs.evidence, confirmedFacts: handoffs.confirmedFacts, unknowns: handoffs.unknowns, nextStep: handoffs.nextStep, nextStepAt: handoffs.nextStepAt, requestedByName: requester.name, closerName: closer.name, returnReason: handoffs.returnReason, requestedAt: handoffs.requestedAt })
      .from(handoffs).innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId)))
      .innerJoin(requester, eq(requester.id, handoffs.requestedByUserId)).leftJoin(closer, eq(closer.id, handoffs.acceptedByUserId))
      .where(and(eq(handoffs.organizationId, input.organizationId), eq(handoffs.status, input.query.status)))
      .orderBy(desc(handoffs.requestedAt)).limit(input.query.limit);
    return rows.map((row) => mapHandoff(row as HandoffRow));
  }

  async create(input: HandoffRepositoryCreateDto): Promise<HandoffRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ id: leads.id, status: leads.status, accountId: leads.accountId, personId: leads.personId, accountName: accounts.name })
        .from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .where(and(eq(leads.id, input.input.leadId), eq(leads.organizationId, input.organizationId))).for('update', { of: leads }).limit(1);
      if (!lead || !['responded', 'converted_to_sdr'].includes(lead.status)) return null;
      const [activeHandoff] = await transaction.select({ id: handoffs.id }).from(handoffs)
        .innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
        .where(and(eq(handoffs.organizationId, input.organizationId), eq(opportunities.leadId, lead.id), inArray(handoffs.status, ['requested', 'accepted']))).limit(1);
      if (activeHandoff) return null;
      const [existingOpportunity] = await transaction.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.leadId, lead.id))).limit(1);
      let opportunityId = existingOpportunity?.id;
      if (!opportunityId) {
        const [opportunity] = await transaction.insert(opportunities).values({ organizationId: input.organizationId, leadId: lead.id, accountId: lead.accountId, primaryPersonId: lead.personId, name: `${lead.accountName} — ${input.input.reason.slice(0, 120)}`, nextAction: input.input.nextStep, nextActionAt: new Date(input.input.nextStepAt), createdByUserId: input.actorUserId }).returning({ id: opportunities.id });
        opportunityId = opportunity.id;
        await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId, fromStage: null, toStage: 'qualification', actorUserId: input.actorUserId, reason: 'Opportunity created from a qualified handoff.' });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'opportunity.created', entityType: 'opportunity', entityId: opportunityId, afterState: { stage: 'qualification', source: 'handoff' } });
      } else {
        await transaction.update(opportunities).set({ nextAction: input.input.nextStep, nextActionAt: new Date(input.input.nextStepAt), updatedAt: new Date() }).where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, input.organizationId)));
      }
      const [handoff] = await transaction.insert(handoffs).values({ organizationId: input.organizationId, opportunityId, reason: input.input.reason, evidence: input.input.evidence, confirmedFacts: input.input.confirmedFacts, unknowns: input.input.unknowns, nextStep: input.input.nextStep, nextStepAt: new Date(input.input.nextStepAt), requestedByUserId: input.actorUserId }).returning({ id: handoffs.id });
      await transaction.insert(handoffHistory).values({ organizationId: input.organizationId, handoffId: handoff.id, event: 'requested', actorUserId: input.actorUserId, note: input.input.reason });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'handoff.requested', entityType: 'handoff', entityId: handoff.id, afterState: { status: 'requested', opportunityId } });
      if (lead.status === 'responded') {
        await transaction.update(leads).set({ status: 'converted_to_sdr', updatedAt: new Date() }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, input.organizationId), eq(leads.status, 'responded')));
        await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: lead.id, fromStatus: 'responded', toStatus: 'converted_to_sdr', changedByUserId: input.actorUserId });
      }
      const [row] = await transaction.select({ id: handoffs.id, opportunityId: handoffs.opportunityId, leadId: opportunities.leadId, opportunityName: opportunities.name, accountName: accounts.name, contactName: people.name, status: handoffs.status, reason: handoffs.reason, evidence: handoffs.evidence, confirmedFacts: handoffs.confirmedFacts, unknowns: handoffs.unknowns, nextStep: handoffs.nextStep, nextStepAt: handoffs.nextStepAt, requestedByName: requester.name, closerName: closer.name, returnReason: handoffs.returnReason, requestedAt: handoffs.requestedAt })
        .from(handoffs).innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId))).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId))).innerJoin(people, and(eq(people.id, opportunities.primaryPersonId), eq(people.organizationId, opportunities.organizationId))).innerJoin(requester, eq(requester.id, handoffs.requestedByUserId)).leftJoin(closer, eq(closer.id, handoffs.acceptedByUserId)).where(eq(handoffs.id, handoff.id)).limit(1);
      return row ? mapHandoff(row as HandoffRow) : null;
    });
  }

  async accept(input: HandoffRepositoryAcceptDto): Promise<HandoffRecordDto | null> {
    const acceptedAt = new Date();
    const updated = await database.transaction(async (transaction) => {
      const [handoff] = await transaction.update(handoffs).set({ status: 'accepted', acceptedByUserId: input.actorUserId, acceptedAt, updatedAt: acceptedAt }).where(and(eq(handoffs.id, input.handoffId), eq(handoffs.organizationId, input.organizationId), eq(handoffs.status, 'requested'))).returning({ id: handoffs.id, opportunityId: handoffs.opportunityId });
      if (!handoff) return null;
      const [opportunity] = await transaction.select({ stage: opportunities.stage }).from(opportunities).where(and(eq(opportunities.id, handoff.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update').limit(1);
      await transaction.update(opportunities).set({ ownerUserId: input.actorUserId, stage: 'closer_contact_pending', stageChangedAt: acceptedAt, updatedAt: acceptedAt }).where(and(eq(opportunities.id, handoff.opportunityId), eq(opportunities.organizationId, input.organizationId)));
      await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId: handoff.opportunityId, fromStage: opportunity?.stage ?? null, toStage: 'closer_contact_pending', actorUserId: input.actorUserId, reason: 'Closer accepted the handoff.' });
      await transaction.insert(handoffHistory).values({ organizationId: input.organizationId, handoffId: handoff.id, event: 'accepted', actorUserId: input.actorUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'handoff.accepted', entityType: 'handoff', entityId: handoff.id, beforeState: { status: 'requested' }, afterState: { status: 'accepted', opportunityId: handoff.opportunityId } });
      return handoff;
    });
    return updated ? this.getRecord(input.organizationId, updated.id) : null;
  }

  async returnToSdr(input: HandoffRepositoryReturnDto): Promise<HandoffRecordDto | null> {
    const returnedAt = new Date();
    const returnedId = await database.transaction(async (transaction) => {
      const [existing] = await transaction.select({ id: handoffs.id, opportunityId: handoffs.opportunityId, leadId: opportunities.leadId, requestedByUserId: handoffs.requestedByUserId, stage: opportunities.stage })
        .from(handoffs).innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
        .where(and(eq(handoffs.id, input.handoffId), eq(handoffs.organizationId, input.organizationId), eq(handoffs.status, 'accepted'))).for('update', { of: handoffs }).limit(1);
      if (!existing) return null;
      await transaction.update(handoffs).set({ status: 'returned', returnReason: input.input.reason, updatedAt: returnedAt, returnedAt }).where(and(eq(handoffs.id, existing.id), eq(handoffs.organizationId, input.organizationId), eq(handoffs.status, 'accepted')));
      await transaction.update(opportunities).set({ ownerUserId: null, stage: 'qualification', stageChangedAt: returnedAt, updatedAt: returnedAt }).where(and(eq(opportunities.id, existing.opportunityId), eq(opportunities.organizationId, input.organizationId)));
      await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId: existing.opportunityId, fromStage: existing.stage, toStage: 'qualification', actorUserId: input.actorUserId, reason: input.input.reason });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'opportunity.stage_changed', entityType: 'opportunity', entityId: existing.opportunityId, beforeState: { stage: existing.stage }, afterState: { stage: 'qualification', ownerUserId: null } });
      await transaction.update(leads).set({ status: 'responded', updatedAt: returnedAt }).where(and(eq(leads.id, existing.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, 'converted_to_sdr')));
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: existing.leadId, fromStatus: 'converted_to_sdr', toStatus: 'responded', changedByUserId: input.actorUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.status_changed', entityType: 'lead', entityId: existing.leadId, beforeState: { status: 'converted_to_sdr' }, afterState: { status: 'responded', source: 'handoff_return' } });
      const dueAt = new Date(input.input.dueAt);
      const [task] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: existing.leadId, title: input.input.nextStep, dueAt, status: 'open', createdByUserId: input.actorUserId, assignedToUserId: existing.requestedByUserId }).returning({ id: tasks.id });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'task.created', entityType: 'task', entityId: task.id, afterState: { status: 'open', dueAt: dueAt.toISOString(), source: 'handoff_return' } });
      await transaction.update(leads).set({ nextActionAt: sql`least(coalesce(${leads.nextActionAt}, ${dueAt}), ${dueAt})`, updatedAt: returnedAt }).where(and(eq(leads.id, existing.leadId), eq(leads.organizationId, input.organizationId)));
      await transaction.update(opportunities).set({ nextAction: input.input.nextStep, nextActionAt: dueAt, updatedAt: returnedAt }).where(and(eq(opportunities.id, existing.opportunityId), eq(opportunities.organizationId, input.organizationId)));
      await transaction.insert(handoffHistory).values({ organizationId: input.organizationId, handoffId: existing.id, event: 'returned', actorUserId: input.actorUserId, note: input.input.reason });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'handoff.returned', entityType: 'handoff', entityId: existing.id, beforeState: { status: 'accepted' }, afterState: { status: 'returned' } });
      return existing.id;
    });
    return returnedId ? this.getRecord(input.organizationId, returnedId) : null;
  }
}
