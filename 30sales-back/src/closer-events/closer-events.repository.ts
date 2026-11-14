import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, closerEvents } from '../db/schema';
import { CloserEventAcknowledgeDto, CloserEventDto, CloserEventStateDto, CloserEventsListDto, CloserEventsPageDto } from './closer-events.dto';

@Injectable()
export class CloserEventsRepository {
  async list(input: CloserEventsListDto): Promise<CloserEventsPageDto> {
    const conditions = and(eq(closerEvents.organizationId, input.organizationId), eq(closerEvents.assignedToUserId, input.userId), eq(closerEvents.status, 'new'));
    const rows = await database.select({ id: closerEvents.id, eventType: closerEvents.eventType, priority: closerEvents.priority, status: closerEvents.status, conversationId: closerEvents.conversationId, opportunityId: closerEvents.opportunityId, accountName: sql<string>`(select a.name from conversations c join accounts a on a.id = c.account_id and a.organization_id = c.organization_id where c.id = ${closerEvents.conversationId} and c.organization_id = ${closerEvents.organizationId})`, contactName: sql<string>`(select p.name from conversations c join people p on p.id = c.person_id and p.organization_id = c.organization_id where c.id = ${closerEvents.conversationId} and c.organization_id = ${closerEvents.organizationId})`, summary: closerEvents.summary, evidence: closerEvents.evidence, occurredAt: closerEvents.occurredAt, acknowledgedAt: closerEvents.acknowledgedAt })
      .from(closerEvents).where(conditions).orderBy(desc(closerEvents.occurredAt), desc(closerEvents.id)).limit(input.query.limit).offset(input.query.offset);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(closerEvents).where(conditions);
    const total = count?.total ?? 0;
    const data = rows.map((row) => new CloserEventDto(row.id, row.eventType, row.priority, row.status, row.conversationId, row.opportunityId, row.accountName, row.contactName, row.summary, row.evidence, row.occurredAt.toISOString(), row.acknowledgedAt?.toISOString() ?? null));
    return new CloserEventsPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async acknowledge(input: CloserEventAcknowledgeDto): Promise<CloserEventStateDto | null> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.update(closerEvents).set({ status: 'acknowledged', acknowledgedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(closerEvents.id, input.eventId), eq(closerEvents.organizationId, input.organizationId), eq(closerEvents.assignedToUserId, input.userId), eq(closerEvents.status, 'new')))
        .returning({ id: closerEvents.id, eventType: closerEvents.eventType, priority: closerEvents.priority, status: closerEvents.status, conversationId: closerEvents.conversationId, opportunityId: closerEvents.opportunityId, summary: closerEvents.summary, evidence: closerEvents.evidence, occurredAt: closerEvents.occurredAt, acknowledgedAt: closerEvents.acknowledgedAt });
      if (!event) return null;
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'closer_event.acknowledged', entityType: 'closer_event', entityId: event.id, correlationId: input.correlationId, afterState: { status: event.status } });
      return new CloserEventStateDto(event.id, event.status, event.acknowledgedAt?.toISOString() ?? null);
    });
  }
}
