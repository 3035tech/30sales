import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, businessLineMembers, businessLines, closerEvents, conversations, handoffs, leads, messages, messagingChannels, opportunities, people, tasks, userNotifications } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import { MarkAllUserNotificationsReadDto, MarkUserNotificationReadDto, UserNotificationDto, UserNotificationsListDto, UserNotificationsPageDto, userNotificationTypeValues } from './notifications.dto';
import { USER_NOTIFICATION_TYPE } from './notifications.constants';

const opportunityLead = alias(leads, 'notification_opportunity_lead');

@Injectable()
export class NotificationsRepository {
  async list(input: UserNotificationsListDto): Promise<UserNotificationsPageDto> {
    const taskLineAccess = input.canManageAll ? undefined : exists(database.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, leads.businessLineId), eq(authMember.userId, input.userId), eq(businessLines.status, 'active'))));
    const opportunityLineAccess = input.canManageAll ? undefined : exists(database.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, opportunityLead.businessLineId), eq(authMember.userId, input.userId), eq(businessLines.status, 'active'))));
    const channelLineAccess = input.canManageAll ? undefined : exists(database.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, messagingChannels.businessLineId), eq(authMember.userId, input.userId), eq(businessLines.status, 'active'))));
    const conversationTypes = [USER_NOTIFICATION_TYPE.inboxNewMessage, USER_NOTIFICATION_TYPE.messageDeliveryFailed, USER_NOTIFICATION_TYPE.mediaDownloadFailed, USER_NOTIFICATION_TYPE.conversationAssigned];
    const opportunityTypes = [USER_NOTIFICATION_TYPE.handoffAccepted, USER_NOTIFICATION_TYPE.handoffReturned, USER_NOTIFICATION_TYPE.opportunityAssigned];
    const closerEventTypes = [USER_NOTIFICATION_TYPE.closerEventSlaOverdue, USER_NOTIFICATION_TYPE.closerEventSlaEscalated];
    const closerEventAccess = and(
      inArray(userNotifications.notificationType, closerEventTypes),
      isNotNull(closerEvents.id),
      or(isNotNull(closerEvents.opportunityId), isNotNull(closerEvents.conversationId)),
      or(isNull(closerEvents.opportunityId), opportunityLineAccess),
      or(isNull(closerEvents.conversationId), channelLineAccess),
    );
    const lineAccess = input.canManageAll ? undefined : or(
      and(eq(userNotifications.notificationType, USER_NOTIFICATION_TYPE.taskOverdue), taskLineAccess),
      and(inArray(userNotifications.notificationType, conversationTypes), channelLineAccess),
      and(eq(userNotifications.notificationType, USER_NOTIFICATION_TYPE.channelDisconnected), channelLineAccess),
      and(inArray(userNotifications.notificationType, opportunityTypes), opportunityLineAccess),
      closerEventAccess,
    );
    const visibility = and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt), lineAccess);
    const rows = await database.select({
      id: userNotifications.id,
      notificationType: userNotifications.notificationType,
      conversationId: sql<string | null>`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`,
      taskId: userNotifications.taskId,
      handoffId: userNotifications.handoffId,
      opportunityId: userNotifications.opportunityId,
      channelId: userNotifications.channelId,
      taskTitle: tasks.title,
      eventType: closerEvents.eventType,
      summary: sql<string>`case when ${userNotifications.notificationType} = 'task_overdue' then coalesce(${tasks.title}, '') when ${userNotifications.notificationType} in ('inbox_new_message', 'message_delivery_failed', 'media_download_failed', 'conversation_assigned') then coalesce(${people.name}, ${accounts.name}, '') when ${userNotifications.notificationType} in ('handoff_accepted', 'opportunity_assigned') then coalesce(${opportunities.name}, '') when ${userNotifications.notificationType} = 'handoff_returned' then coalesce(${handoffs.returnReason}, '') when ${userNotifications.notificationType} = 'channel_disconnected' then coalesce(${messagingChannels.displayName}, '') else ${closerEvents.summary} end`,
      accountName: accounts.name,
      contactName: people.name,
      contactPhone: people.phone,
      messagePreview: sql<string | null>`case when ${userNotifications.notificationType} = 'inbox_new_message' then (select nullif(left(trim(${messages.bodyText}), 180), '') from ${messages} where ${messages.organizationId} = ${userNotifications.organizationId} and ${messages.conversationId} = ${userNotifications.conversationId} and ${messages.direction} = 'inbound' and ${messages.createdAt} <= ${userNotifications.createdAt} order by ${messages.createdAt} desc, ${messages.id} desc limit 1) else null end`,
      dueAt: sql<Date | null>`coalesce(${closerEvents.dueAt}, ${tasks.dueAt})`,
      createdAt: userNotifications.createdAt,
    }).from(userNotifications)
      .leftJoin(closerEvents, and(eq(closerEvents.id, userNotifications.closerEventId), eq(closerEvents.organizationId, userNotifications.organizationId)))
      .leftJoin(tasks, and(eq(tasks.id, userNotifications.taskId), eq(tasks.organizationId, userNotifications.organizationId)))
      .leftJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .leftJoin(handoffs, and(eq(handoffs.id, userNotifications.handoffId), eq(handoffs.organizationId, userNotifications.organizationId)))
      .leftJoin(opportunities, and(eq(opportunities.id, sql`coalesce(${userNotifications.opportunityId}, ${handoffs.opportunityId}, ${closerEvents.opportunityId})`), eq(opportunities.organizationId, userNotifications.organizationId)))
      .leftJoin(opportunityLead, and(eq(opportunityLead.id, opportunities.leadId), eq(opportunityLead.organizationId, opportunities.organizationId)))
      .leftJoin(conversations, and(eq(conversations.id, sql`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`), eq(conversations.organizationId, userNotifications.organizationId)))
      .leftJoin(accounts, and(eq(accounts.id, sql`coalesce(${conversations.accountId}, ${leads.accountId}, ${opportunityLead.accountId}, ${opportunities.accountId})`), eq(accounts.organizationId, userNotifications.organizationId)))
      .leftJoin(people, and(eq(people.id, sql`coalesce(${conversations.personId}, ${leads.personId}, ${opportunityLead.personId}, ${opportunities.primaryPersonId})`), eq(people.organizationId, userNotifications.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, sql`coalesce(${userNotifications.channelId}, ${conversations.channelId})`), eq(messagingChannels.organizationId, userNotifications.organizationId)))
      .where(visibility)
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id)).limit(input.limit);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(userNotifications)
      .leftJoin(tasks, and(eq(tasks.id, userNotifications.taskId), eq(tasks.organizationId, userNotifications.organizationId)))
      .leftJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .leftJoin(handoffs, and(eq(handoffs.id, userNotifications.handoffId), eq(handoffs.organizationId, userNotifications.organizationId)))
      .leftJoin(closerEvents, and(eq(closerEvents.id, userNotifications.closerEventId), eq(closerEvents.organizationId, userNotifications.organizationId)))
      .leftJoin(opportunities, and(eq(opportunities.id, sql`coalesce(${userNotifications.opportunityId}, ${handoffs.opportunityId}, ${closerEvents.opportunityId})`), eq(opportunities.organizationId, userNotifications.organizationId)))
      .leftJoin(opportunityLead, and(eq(opportunityLead.id, opportunities.leadId), eq(opportunityLead.organizationId, opportunities.organizationId)))
      .leftJoin(conversations, and(eq(conversations.id, sql`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`), eq(conversations.organizationId, userNotifications.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, sql`coalesce(${userNotifications.channelId}, ${conversations.channelId})`), eq(messagingChannels.organizationId, userNotifications.organizationId)))
      .where(visibility);
    const data = rows.flatMap((row) => {
      const notificationType = userNotificationTypeValues.find((value) => value === row.notificationType);
      const dueAt = row.dueAt ? new Date(row.dueAt.toString()).toISOString() : null;
      return (row.conversationId || row.taskId || row.handoffId || row.opportunityId || row.channelId) && notificationType ? [new UserNotificationDto(row.id, notificationType, row.conversationId, row.taskId, row.handoffId, row.opportunityId, row.channelId, row.taskTitle, row.eventType, row.summary, row.accountName, row.contactName, row.contactPhone, row.messagePreview, dueAt, row.createdAt.toISOString())] : [];
    });
    return new UserNotificationsPageDto(data, count?.total ?? 0);
  }

  async processOverdueTaskNotifications(limit = 100): Promise<number> {
    const organizations = await database.selectDistinct({ organizationId: authMember.organizationId }).from(authMember);
    let createdCount = 0;
    for (const { organizationId } of organizations) {
      createdCount += await database.transaction(async (transaction) => {
        const now = new Date();
        const recipientUserId = sql<string>`coalesce(${tasks.assignedToUserId}, ${tasks.createdByUserId})`;
        const taskLineMembership = exists(transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
          .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
          .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, leads.businessLineId), eq(businessLineMembers.memberId, authMember.id), eq(businessLines.status, 'active'))));
        const eligibleRecipient = or(sql`${authMember.role} ~ '(^|,)(owner|admin|manager)(,|$)'`, taskLineMembership);
        const overdueTasks = await transaction.select({ id: tasks.id, organizationId: tasks.organizationId, recipientUserId, dueAt: tasks.dueAt })
          .from(tasks)
          .innerJoin(authMember, and(eq(authMember.organizationId, tasks.organizationId), eq(authMember.userId, recipientUserId)))
          .innerJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
          .where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, 'open'), lte(tasks.dueAt, now), eligibleRecipient))
          .orderBy(asc(tasks.dueAt), asc(tasks.id)).limit(limit).for('update', { of: tasks, skipLocked: true });
        if (!overdueTasks.length) return 0;
        const created = await transaction.insert(userNotifications).values(overdueTasks.map((task) => ({
            organizationId: task.organizationId,
            recipientUserId: task.recipientUserId,
            taskId: task.id,
            notificationType: 'task_overdue',
            idempotencyKey: `task-overdue:${task.id}:${task.recipientUserId}:${task.dueAt.toISOString()}`,
          }))).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] }).returning({ id: userNotifications.id });
        return created.length;
      });
    }
    return createdCount;
  }

  async markRead(input: MarkUserNotificationReadDto): Promise<boolean> {
    const [updated] = await database.update(userNotifications).set({ readAt: new Date() }).where(and(
      eq(userNotifications.id, input.id),
      eq(userNotifications.organizationId, input.organizationId),
      eq(userNotifications.recipientUserId, input.userId),
      isNull(userNotifications.readAt),
    )).returning({ id: userNotifications.id });
    if (updated) return true;
    const [existing] = await database.select({ id: userNotifications.id }).from(userNotifications).where(and(
      eq(userNotifications.id, input.id), eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId),
    )).limit(1);
    return Boolean(existing);
  }

  async markAllRead(input: MarkAllUserNotificationsReadDto): Promise<void> {
    await database.update(userNotifications).set({ readAt: new Date() }).where(and(
      eq(userNotifications.organizationId, input.organizationId),
      eq(userNotifications.recipientUserId, input.userId),
      isNull(userNotifications.readAt),
    ));
  }
}
