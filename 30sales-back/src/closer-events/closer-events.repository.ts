import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { database } from '../db';
import { accounts, auditEvents, businessLineMembers, businessLines, closerEventSlaPolicies, closerEvents, conversations, leads, messagingChannels, opportunities, people, userNotifications } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { CloserEventDto, CloserEventMutationDto, CloserEventStateDto, CloserEventsListDto, CloserEventsPageDto, CloserEventAssigneeDto, CloserEventSlaPoliciesSaveDto, CloserEventSlaPolicyDto, CloserSlaNotificationsListDto, CloserSlaNotificationDto, CloserSlaNotificationReadDto } from './closer-events.dto';
import { ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

function closerEventLineAccessCondition(organizationId: string, userId: string): SQL | undefined {
  const conversationAccess = exists(database.select({ id: conversations.id }).from(conversations)
    .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
    .innerJoin(businessLineMembers, and(eq(businessLineMembers.businessLineId, messagingChannels.businessLineId), eq(businessLineMembers.organizationId, messagingChannels.organizationId)))
    .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
    .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
    .where(and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, organizationId), eq(authMember.userId, userId), eq(businessLines.status, 'active'))));
  const opportunityAccess = exists(database.select({ id: opportunities.id }).from(opportunities)
    .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
    .innerJoin(businessLineMembers, and(eq(businessLineMembers.businessLineId, leads.businessLineId), eq(businessLineMembers.organizationId, leads.organizationId)))
    .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
    .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
    .where(and(eq(opportunities.id, closerEvents.opportunityId), eq(opportunities.organizationId, organizationId), eq(authMember.userId, userId), eq(businessLines.status, 'active'))));
  return and(or(isNull(closerEvents.conversationId), conversationAccess), or(isNull(closerEvents.opportunityId), opportunityAccess), or(isNotNull(closerEvents.conversationId), isNotNull(closerEvents.opportunityId)));
}

@Injectable()
export class CloserEventsRepository {
  async accessibleBusinessLineIds(organizationId: string, userId: string): Promise<string[]> {
    const rows = await database.select({ id: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(authMember.userId, userId), eq(businessLines.status, 'active')));
    return rows.map((row) => row.id);
  }

  async list(input: CloserEventsListDto): Promise<CloserEventsPageDto> {
    const eventLineCondition = input.query.businessLineId ? or(
      exists(database.select({ id: conversations.id }).from(conversations).innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId))).where(and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, input.organizationId), eq(messagingChannels.businessLineId, input.query.businessLineId)))),
      exists(database.select({ id: opportunities.id }).from(opportunities).innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId))).where(and(eq(opportunities.id, closerEvents.opportunityId), eq(opportunities.organizationId, input.organizationId), eq(leads.businessLineId, input.query.businessLineId)))),
    ) : undefined;
    const conditions = and(eq(closerEvents.organizationId, input.organizationId), eventLineCondition, input.accessibleBusinessLineIds ? or(
      exists(database.select({ id: conversations.id }).from(conversations).innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId))).where(and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, input.organizationId), inArray(messagingChannels.businessLineId, input.accessibleBusinessLineIds)))),
      exists(database.select({ id: opportunities.id }).from(opportunities).innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId))).where(and(eq(opportunities.id, closerEvents.opportunityId), eq(opportunities.organizationId, input.organizationId), inArray(leads.businessLineId, input.accessibleBusinessLineIds)))),
    ) : undefined, input.canManageAll ? undefined : and(eq(closerEvents.assignedToUserId, input.userId), closerEventLineAccessCondition(input.organizationId, input.userId)), sql`(${closerEvents.status} = 'new' or (${closerEvents.status} = 'snoozed' and (${closerEvents.snoozedUntil} is null or ${closerEvents.snoozedUntil} <= now())))`);
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

      if (!overdueEvents.length) return 0;

      const ownerMembershipConditions = overdueEvents.map((event) => and(eq(authMember.organizationId, event.organizationId), eq(authMember.userId, event.assignedToUserId)));
      const ownerMemberships = await transaction.select({ organizationId: authMember.organizationId, userId: authMember.userId }).from(authMember).where(or(...ownerMembershipConditions));
      const ownerMembershipKeys = new Set(ownerMemberships.map((membership) => `${membership.organizationId}:${membership.userId}`));
      const ownerNotifications = overdueEvents.filter((event) => ownerMembershipKeys.has(`${event.organizationId}:${event.assignedToUserId}`)).map((event) => ({
        organizationId: event.organizationId,
        recipientUserId: event.assignedToUserId,
        closerEventId: event.id,
        notificationType: 'closer_event_sla_overdue' as const,
        idempotencyKey: `closer-event-sla-overdue:${event.id}:${event.assignedToUserId}`,
      }));
      if (ownerNotifications.length) await transaction.insert(userNotifications).values(ownerNotifications)
        .onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });

      const escalationEvents = overdueEvents.filter((event) => event.escalateToManagers);
      const escalationOrganizationIds = [...new Set(escalationEvents.map((event) => event.organizationId))];
      const managers = escalationOrganizationIds.length ? await transaction.select({ organizationId: authMember.organizationId, userId: authMember.userId }).from(authMember)
        .where(and(inArray(authMember.organizationId, escalationOrganizationIds), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY[${ORGANIZATION_MANAGEMENT_ROLES[0]}, ${ORGANIZATION_MANAGEMENT_ROLES[1]}, ${ORGANIZATION_MANAGEMENT_ROLES[2]}]::text[]`)) : [];
      const managersByOrganization = new Map<string, string[]>();
      for (const manager of managers) {
        const organizationManagers = managersByOrganization.get(manager.organizationId);
        if (organizationManagers) organizationManagers.push(manager.userId);
        else managersByOrganization.set(manager.organizationId, [manager.userId]);
      }
      const managerNotifications = escalationEvents.flatMap((event) => (managersByOrganization.get(event.organizationId) ?? [])
        .filter((managerId) => managerId !== event.assignedToUserId)
        .map((managerId) => ({
          organizationId: event.organizationId,
          recipientUserId: managerId,
          closerEventId: event.id,
          notificationType: 'closer_event_sla_escalated' as const,
          idempotencyKey: `closer-event-sla-escalated:${event.id}:${managerId}`,
        })));
      const managerNotificationCounts = new Map<string, number>();
      for (let offset = 0; offset < managerNotifications.length; offset += 500) {
        const created = await transaction.insert(userNotifications).values(managerNotifications.slice(offset, offset + 500))
          .onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] })
          .returning({ closerEventId: userNotifications.closerEventId });
        for (const notification of created) {
          if (notification.closerEventId) managerNotificationCounts.set(notification.closerEventId, (managerNotificationCounts.get(notification.closerEventId) ?? 0) + 1);
        }
      }

      await transaction.update(closerEvents).set({ slaNotifiedAt: now, updatedAt: now }).where(and(
        inArray(closerEvents.id, overdueEvents.map((event) => event.id)),
        or(...overdueEvents.map((event) => and(eq(closerEvents.id, event.id), eq(closerEvents.organizationId, event.organizationId)))),
        isNull(closerEvents.slaNotifiedAt),
      ));
      await transaction.insert(auditEvents).values(overdueEvents.map((event) => ({
        organizationId: event.organizationId,
        actorType: 'system' as const,
        action: event.escalateToManagers ? 'closer_event.sla_escalated' : 'closer_event.sla_overdue',
        entityType: 'closer_event',
        entityId: event.id,
        afterState: { dueAt: event.dueAt?.toISOString() ?? null, ownerNotified: ownerMembershipKeys.has(`${event.organizationId}:${event.assignedToUserId}`), managerNotificationCount: managerNotificationCounts.get(event.id) ?? 0 },
      })));
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
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt), input.canManageAll ? undefined : closerEventLineAccessCondition(input.organizationId, input.userId)))
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
      const [current] = await transaction.select({ id: closerEvents.id, status: closerEvents.status, assignedToUserId: closerEvents.assignedToUserId, acknowledgedAt: closerEvents.acknowledgedAt, snoozedUntil: closerEvents.snoozedUntil, resolvedAt: closerEvents.resolvedAt, conversationBusinessLineId: messagingChannels.businessLineId, opportunityBusinessLineId: leads.businessLineId })
        .from(closerEvents)
        .leftJoin(conversations, and(eq(conversations.id, closerEvents.conversationId), eq(conversations.organizationId, closerEvents.organizationId)))
        .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
        .leftJoin(opportunities, and(eq(opportunities.id, closerEvents.opportunityId), eq(opportunities.organizationId, closerEvents.organizationId)))
        .leftJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
        .where(and(eq(closerEvents.id, input.eventId), eq(closerEvents.organizationId, input.organizationId), input.canManageAll ? undefined : closerEventLineAccessCondition(input.organizationId, input.actorUserId))).for('update', { of: closerEvents }).limit(1);
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
        const businessLineIds = [...new Set([current.conversationBusinessLineId, current.opportunityBusinessLineId].filter((id): id is string => id !== null))];
        const lineMemberships = businessLineIds.length ? await transaction.select({ businessLineId: businessLineMembers.businessLineId }).from(businessLineMembers)
          .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
          .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(authMember.userId, input.input.assignedToUserId), inArray(businessLineMembers.businessLineId, businessLineIds))) : [];
        if (!membership || businessLineIds.length === 0 || businessLineIds.some((businessLineId) => !lineMemberships.some((row) => row.businessLineId === businessLineId))) return 'invalid_assignee';
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
