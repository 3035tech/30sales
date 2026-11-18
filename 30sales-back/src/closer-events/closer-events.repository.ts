import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, auditEvents, closerEventSlaPolicies, closerEvents, conversations, people, userNotifications } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { CloserEventDto, CloserEventMutationDto, CloserEventStateDto, CloserEventsListDto, CloserEventsPageDto, CloserEventAssigneeDto, CloserEventSlaPoliciesSaveDto, CloserEventSlaPolicyDto, CloserSlaNotificationsListDto, CloserSlaNotificationDto, CloserSlaNotificationReadDto } from './closer-events.dto';
import { ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class CloserEventsRepository {
  async list(input: CloserEventsListDto): Promise<CloserEventsPageDto> {
    const conditions = and(eq(closerEvents.organizationId, input.organizationId), input.canManageAll ? undefined : eq(closerEvents.assignedToUserId, input.userId), sql`(${closerEvents.status} = 'new' or (${closerEvents.status} = 'snoozed' and (${closerEvents.snoozedUntil} is null or ${closerEvents.snoozedUntil} <= now())))`);
    const rows = await database.select({ id: closerEvents.id, eventType: closerEvents.eventType, priority: closerEvents.priority, status: closerEvents.status, conversationId: closerEvents.conversationId, opportunityId: closerEvents.opportunityId, assignedToUserId: closerEvents.assignedToUserId, accountName: accounts.name, contactName: people.name, summary: closerEvents.summary, evidence: closerEvents.evidence, occurredAt: closerEvents.occurredAt, dueAt: closerEvents.dueAt, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil })
      .from(closerEvents).leftJoin(conversations, and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, closerEvents.organizationId))).leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, closerEvents.organizationId))).leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, closerEvents.organizationId))).where(conditions).orderBy(desc(closerEvents.occurredAt), desc(closerEvents.id)).limit(input.query.limit).offset(input.query.offset);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(closerEvents).where(conditions);
    const total = count?.total ?? 0;
    const data = rows.map((row) => new CloserEventDto(row.id, row.eventType, row.priority, row.status, row.conversationId, row.opportunityId, row.assignedToUserId, row.accountName, row.contactName, row.summary, row.evidence, row.occurredAt.toISOString(), row.dueAt?.toISOString() ?? null, row.acknowledgedAt?.toISOString() ?? null, row.snoozedUntil?.toISOString() ?? null));
    return new CloserEventsPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async getSlaPolicies(organizationId: string): Promise<CloserEventSlaPolicyDto[]> {
    const rows = await database.select({ eventType: closerEventSlaPolicies.eventType, targetMinutes: closerEventSlaPolicies.targetMinutes, escalateToManagers: closerEventSlaPolicies.escalateToManagers })
      .from(closerEventSlaPolicies).where(eq(closerEventSlaPolicies.organizationId, organizationId));
    return rows.map((row) => new CloserEventSlaPolicyDto(row.eventType, row.targetMinutes, row.escalateToManagers));
  }

  async saveSlaPolicies(input: CloserEventSlaPoliciesSaveDto): Promise<CloserEventSlaPolicyDto[]> {
    return database.transaction(async (transaction) => {
      const saved: CloserEventSlaPolicyDto[] = [];
      for (const policy of input.input.policies) {
        const [current] = await transaction.select({ targetMinutes: closerEventSlaPolicies.targetMinutes, escalateToManagers: closerEventSlaPolicies.escalateToManagers }).from(closerEventSlaPolicies)
          .where(and(eq(closerEventSlaPolicies.organizationId, input.organizationId), eq(closerEventSlaPolicies.eventType, policy.eventType))).for('update').limit(1);
        if (current?.targetMinutes === policy.targetMinutes && current.escalateToManagers === policy.escalateToManagers || (!current && policy.targetMinutes === null)) {
          saved.push(new CloserEventSlaPolicyDto(policy.eventType, current?.targetMinutes ?? null, current?.escalateToManagers ?? false));
          continue;
        }
        if (policy.targetMinutes === null) {
          await transaction.delete(closerEventSlaPolicies).where(and(eq(closerEventSlaPolicies.organizationId, input.organizationId), eq(closerEventSlaPolicies.eventType, policy.eventType)));
        } else {
          await transaction.insert(closerEventSlaPolicies).values({ organizationId: input.organizationId, eventType: policy.eventType, targetMinutes: policy.targetMinutes, escalateToManagers: policy.escalateToManagers, updatedByUserId: input.userId })
            .onConflictDoUpdate({ target: [closerEventSlaPolicies.organizationId, closerEventSlaPolicies.eventType], set: { targetMinutes: policy.targetMinutes, escalateToManagers: policy.escalateToManagers, updatedByUserId: input.userId, updatedAt: new Date() } });
        }
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'closer_event.sla_policy_updated', entityType: 'closer_event_sla_policy', entityId: null, correlationId: input.correlationId, beforeState: { eventType: policy.eventType, targetMinutes: current?.targetMinutes ?? null, escalateToManagers: current?.escalateToManagers ?? false }, afterState: { eventType: policy.eventType, targetMinutes: policy.targetMinutes, escalateToManagers: policy.escalateToManagers } });
        saved.push(new CloserEventSlaPolicyDto(policy.eventType, policy.targetMinutes, policy.escalateToManagers));
      }
      return saved;
    });
  }

  async processOverdueSlaNotifications(limit = 100): Promise<number> {
    return database.transaction(async (transaction) => {
      const now = new Date();
      const overdueEvents = await transaction.select({
        id: closerEvents.id,
        organizationId: closerEvents.organizationId,
        eventType: closerEvents.eventType,
        assignedToUserId: closerEvents.assignedToUserId,
        conversationId: closerEvents.conversationId,
        dueAt: closerEvents.dueAt,
        summary: closerEvents.summary,
        escalateToManagers: closerEvents.slaEscalateToManagers,
      }).from(closerEvents).where(and(
        inArray(closerEvents.status, ['new', 'acknowledged', 'snoozed']),
        isNotNull(closerEvents.dueAt),
        lte(closerEvents.dueAt, now),
        isNull(closerEvents.slaNotifiedAt),
      )).orderBy(asc(closerEvents.dueAt), asc(closerEvents.id)).limit(limit).for('update', { of: closerEvents, skipLocked: true });

      for (const event of overdueEvents) {
        const [ownerMembership] = await transaction.select({ userId: authMember.userId }).from(authMember)
          .where(and(eq(authMember.organizationId, event.organizationId), eq(authMember.userId, event.assignedToUserId))).limit(1);
        if (ownerMembership) {
          await transaction.insert(userNotifications).values({
            organizationId: event.organizationId,
            recipientUserId: event.assignedToUserId,
            closerEventId: event.id,
            notificationType: 'closer_event_sla_overdue',
            idempotencyKey: `closer-event-sla-overdue:${event.id}:${event.assignedToUserId}`,
          }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
        }

        let managerCount = 0;
        if (event.escalateToManagers) {
          const managers = await transaction.select({ userId: authMember.userId }).from(authMember)
            .where(and(
              eq(authMember.organizationId, event.organizationId),
              sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY[${ORGANIZATION_MANAGEMENT_ROLES[0]}, ${ORGANIZATION_MANAGEMENT_ROLES[1]}, ${ORGANIZATION_MANAGEMENT_ROLES[2]}]::text[]`,
              event.assignedToUserId ? sql`${authMember.userId} <> ${event.assignedToUserId}` : sql`true`,
            ));
          for (const manager of managers) {
            const [created] = await transaction.insert(userNotifications).values({
              organizationId: event.organizationId,
              recipientUserId: manager.userId,
              closerEventId: event.id,
              notificationType: 'closer_event_sla_escalated',
              idempotencyKey: `closer-event-sla-escalated:${event.id}:${manager.userId}`,
            }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] }).returning({ id: userNotifications.id });
            if (created) managerCount += 1;
          }
        }

        await transaction.update(closerEvents).set({ slaNotifiedAt: now, updatedAt: now })
          .where(and(eq(closerEvents.id, event.id), eq(closerEvents.organizationId, event.organizationId), isNull(closerEvents.slaNotifiedAt)));
        await transaction.insert(auditEvents).values({
          organizationId: event.organizationId,
          actorType: 'system',
          action: event.escalateToManagers ? 'closer_event.sla_escalated' : 'closer_event.sla_overdue',
          entityType: 'closer_event',
          entityId: event.id,
          afterState: { dueAt: event.dueAt?.toISOString() ?? null, ownerNotified: Boolean(ownerMembership), managerNotificationCount: managerCount },
        });
      }
      return overdueEvents.length;
    });
  }

  async listSlaNotifications(input: CloserSlaNotificationsListDto): Promise<CloserSlaNotificationDto[]> {
    const rows = await database.select({
      id: userNotifications.id,
      closerEventId: closerEvents.id,
      conversationId: closerEvents.conversationId,
      notificationType: userNotifications.notificationType,
      eventType: closerEvents.eventType,
      summary: closerEvents.summary,
      accountName: accounts.name,
      dueAt: closerEvents.dueAt,
      createdAt: userNotifications.createdAt,
    }).from(userNotifications)
      .innerJoin(closerEvents, and(eq(closerEvents.id, userNotifications.closerEventId), eq(closerEvents.organizationId, userNotifications.organizationId)))
      .innerJoin(conversations, and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, closerEvents.organizationId)))
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt)))
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id)).limit(input.limit);
    return rows.flatMap((row) => row.dueAt ? [new CloserSlaNotificationDto(row.id, row.closerEventId, row.conversationId, row.notificationType, row.eventType, row.summary, row.accountName, row.dueAt.toISOString(), row.createdAt.toISOString())] : []);
  }

  async markSlaNotificationRead(input: CloserSlaNotificationReadDto): Promise<boolean> {
    const [updated] = await database.update(userNotifications).set({ readAt: new Date() }).where(and(
      eq(userNotifications.id, input.id),
      eq(userNotifications.organizationId, input.organizationId),
      eq(userNotifications.recipientUserId, input.userId),
      isNull(userNotifications.readAt),
    )).returning({ id: userNotifications.id });
    return Boolean(updated);
  }

  async listAssignees(organizationId: string): Promise<CloserEventAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name }).from(authMember).innerJoin(authUser, eq(authUser.id, authMember.userId))
      .where(and(eq(authMember.organizationId, organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`)).orderBy(authUser.name);
    return rows.map((row) => new CloserEventAssigneeDto(row.id, row.name));
  }

  async act(input: CloserEventMutationDto): Promise<CloserEventStateDto | 'not_found' | 'not_owner' | 'invalid_assignee'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: closerEvents.id, status: closerEvents.status, assignedToUserId: closerEvents.assignedToUserId, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil, resolvedAt: closerEvents.resolvedAt })
        .from(closerEvents).where(and(eq(closerEvents.id, input.eventId), eq(closerEvents.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.assignedToUserId !== input.actorUserId && !input.canManageAll) return 'not_owner';

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
        status = 'snoozed'; snoozedUntil = new Date(input.input.snoozedUntil);
      } else if (input.input.action === 'resolve') {
        if (!['new', 'snoozed', 'acknowledged'].includes(current.status)) return 'not_found';
        status = 'resolved'; resolvedAt = now; snoozedUntil = null;
      } else {
        if (!['new', 'snoozed'].includes(current.status)) return 'not_found';
        const [membership] = await transaction.select({ id: authMember.id }).from(authMember)
          .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.input.assignedToUserId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`)).limit(1);
        if (!membership) return 'invalid_assignee';
        assignedToUserId = input.input.assignedToUserId;
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
