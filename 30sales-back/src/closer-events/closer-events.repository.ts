import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, closerEvents } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { CloserEventDto, CloserEventMutationDto, CloserEventStateDto, CloserEventsListDto, CloserEventsPageDto, CloserEventAssigneeDto } from './closer-events.dto';

@Injectable()
export class CloserEventsRepository {
  async list(input: CloserEventsListDto): Promise<CloserEventsPageDto> {
    const conditions = and(eq(closerEvents.organizationId, input.organizationId), eq(closerEvents.assignedToUserId, input.userId), sql`(${closerEvents.status} = 'new' or (${closerEvents.status} = 'snoozed' and (${closerEvents.snoozedUntil} is null or ${closerEvents.snoozedUntil} <= now())))`);
    const rows = await database.select({ id: closerEvents.id, eventType: closerEvents.eventType, priority: closerEvents.priority, status: closerEvents.status, conversationId: closerEvents.conversationId, opportunityId: closerEvents.opportunityId, assignedToUserId: closerEvents.assignedToUserId, accountName: sql<string>`(select a.name from conversations c join accounts a on a.id = c.account_id and a.organization_id = c.organization_id where c.id = ${closerEvents.conversationId} and c.organization_id = ${closerEvents.organizationId})`, contactName: sql<string>`(select p.name from conversations c join people p on p.id = c.person_id and p.organization_id = c.organization_id where c.id = ${closerEvents.conversationId} and c.organization_id = ${closerEvents.organizationId})`, summary: closerEvents.summary, evidence: closerEvents.evidence, occurredAt: closerEvents.occurredAt, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil })
      .from(closerEvents).where(conditions).orderBy(desc(closerEvents.occurredAt), desc(closerEvents.id)).limit(input.query.limit).offset(input.query.offset);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(closerEvents).where(conditions);
    const total = count?.total ?? 0;
    const data = rows.map((row) => new CloserEventDto(row.id, row.eventType, row.priority, row.status, row.conversationId, row.opportunityId, row.assignedToUserId, row.accountName, row.contactName, row.summary, row.evidence, row.occurredAt.toISOString(), row.acknowledgedAt?.toISOString() ?? null, row.snoozedUntil?.toISOString() ?? null));
    return new CloserEventsPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async listAssignees(organizationId: string): Promise<CloserEventAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name }).from(authMember).innerJoin(authUser, eq(authUser.id, authMember.userId))
      .where(and(eq(authMember.organizationId, organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY['closer']::text[]`)).orderBy(authUser.name);
    return rows.map((row) => new CloserEventAssigneeDto(row.id, row.name));
  }

  async act(input: CloserEventMutationDto): Promise<CloserEventStateDto | 'not_found' | 'not_owner' | 'invalid_assignee'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: closerEvents.id, status: closerEvents.status, assignedToUserId: closerEvents.assignedToUserId, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil, resolvedAt: closerEvents.resolvedAt })
        .from(closerEvents).where(and(eq(closerEvents.id, input.eventId), eq(closerEvents.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.assignedToUserId !== input.actorUserId && !['owner', 'admin', 'manager'].includes(input.actorRole)) return 'not_owner';

      const now = new Date();
      let status = current.status;
      let assignedToUserId = current.assignedToUserId;
      let snoozedUntil: Date | null = current.snoozedUntil;
      let acknowledgedAt: Date | null = current.acknowledgedAt;
      let resolvedAt: Date | null = current.resolvedAt;
      if (input.input.action === 'acknowledge') {
        if (!['new', 'snoozed'].includes(current.status)) return 'not_found';
        status = 'acknowledged'; acknowledgedAt = now; snoozedUntil = null;
      } else if (input.input.action === 'snooze') {
        if (!['new', 'snoozed'].includes(current.status)) return 'not_found';
        status = 'snoozed'; snoozedUntil = new Date(input.input.snoozedUntil!);
      } else if (input.input.action === 'resolve') {
        if (!['new', 'snoozed', 'acknowledged'].includes(current.status)) return 'not_found';
        status = 'resolved'; resolvedAt = now; snoozedUntil = null;
      } else {
        if (!['new', 'snoozed'].includes(current.status)) return 'not_found';
        const [membership] = await transaction.select({ id: authMember.id }).from(authMember)
          .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.input.assignedToUserId!), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY['closer']::text[]`)).limit(1);
        if (!membership) return 'invalid_assignee';
        assignedToUserId = input.input.assignedToUserId!;
        status = 'new'; snoozedUntil = null;
      }
      const [updated] = await transaction.update(closerEvents).set({ status, assignedToUserId, acknowledgedAt, snoozedUntil, resolvedAt, updatedAt: now })
        .where(and(eq(closerEvents.id, input.eventId), eq(closerEvents.organizationId, input.organizationId)))
        .returning({ id: closerEvents.id, status: closerEvents.status, assignedToUserId: closerEvents.assignedToUserId, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil, resolvedAt: closerEvents.resolvedAt });
      const action = input.input.action === 'reassign' ? 'reassigned' : input.input.action === 'snooze' ? 'snoozed' : input.input.action === 'resolve' ? 'resolved' : 'acknowledged';
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: `closer_event.${action}`, entityType: 'closer_event', entityId: updated.id, correlationId: input.correlationId, beforeState: { status: current.status, assignedToUserId: current.assignedToUserId }, afterState: { status: updated.status, assignedToUserId: updated.assignedToUserId, snoozedUntil: updated.snoozedUntil?.toISOString() ?? null } });
      return new CloserEventStateDto(updated.id, updated.status, updated.assignedToUserId, updated.acknowledgedAt?.toISOString() ?? null, updated.snoozedUntil?.toISOString() ?? null, updated.resolvedAt?.toISOString() ?? null);
    });
  }
}
