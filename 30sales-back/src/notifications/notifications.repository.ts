import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, closerEvents, conversations, handoffs, leads, opportunities, people, tasks, userNotifications } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import { MarkUserNotificationReadDto, UserNotificationDto, UserNotificationsListDto, UserNotificationsPageDto, userNotificationTypeValues } from './notifications.dto';

@Injectable()
export class NotificationsRepository {
  async list(input: UserNotificationsListDto): Promise<UserNotificationsPageDto> {
    const rows = await database.select({
      id: userNotifications.id,
      notificationType: userNotifications.notificationType,
      conversationId: sql<string | null>`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`,
      taskId: userNotifications.taskId,
      handoffId: userNotifications.handoffId,
      opportunityId: userNotifications.opportunityId,
      taskTitle: tasks.title,
      eventType: closerEvents.eventType,
      summary: sql<string>`case when ${userNotifications.notificationType} = 'task_overdue' then coalesce(${tasks.title}, '') when ${userNotifications.notificationType} = 'inbox_new_message' then coalesce(${people.name}, ${accounts.name}, '') when ${userNotifications.notificationType} in ('handoff_accepted', 'opportunity_assigned') then coalesce(${opportunities.name}, '') when ${userNotifications.notificationType} = 'handoff_returned' then coalesce(${handoffs.returnReason}, '') when ${userNotifications.notificationType} = 'conversation_assigned' then coalesce(${people.name}, ${accounts.name}, '') else ${closerEvents.summary} end`,
      accountName: accounts.name,
      contactName: people.name,
      dueAt: sql<Date | null>`coalesce(${closerEvents.dueAt}, ${tasks.dueAt})`,
      createdAt: userNotifications.createdAt,
    }).from(userNotifications)
      .leftJoin(closerEvents, and(eq(closerEvents.id, userNotifications.closerEventId), eq(closerEvents.organizationId, userNotifications.organizationId)))
      .leftJoin(tasks, and(eq(tasks.id, userNotifications.taskId), eq(tasks.organizationId, userNotifications.organizationId)))
      .leftJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .leftJoin(handoffs, and(eq(handoffs.id, userNotifications.handoffId), eq(handoffs.organizationId, userNotifications.organizationId)))
      .leftJoin(opportunities, and(eq(opportunities.id, sql`coalesce(${userNotifications.opportunityId}, ${handoffs.opportunityId})`), eq(opportunities.organizationId, userNotifications.organizationId)))
      .leftJoin(conversations, and(eq(conversations.id, sql`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`), eq(conversations.organizationId, userNotifications.organizationId)))
      .leftJoin(accounts, and(eq(accounts.id, sql`coalesce(${conversations.accountId}, ${leads.accountId}, ${opportunities.accountId})`), eq(accounts.organizationId, userNotifications.organizationId)))
      .leftJoin(people, and(eq(people.id, sql`coalesce(${conversations.personId}, ${leads.personId}, ${opportunities.primaryPersonId})`), eq(people.organizationId, userNotifications.organizationId)))
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt)))
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id)).limit(input.limit);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(userNotifications)
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt)));
    const data = rows.flatMap((row) => {
      const notificationType = userNotificationTypeValues.find((value) => value === row.notificationType);
      return (row.conversationId || row.taskId || row.handoffId || row.opportunityId) && notificationType ? [new UserNotificationDto(row.id, notificationType, row.conversationId, row.taskId, row.handoffId, row.opportunityId, row.taskTitle, row.eventType, row.summary, row.accountName, row.contactName, row.dueAt?.toISOString() ?? null, row.createdAt.toISOString())] : [];
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
        const overdueTasks = await transaction.select({ id: tasks.id, organizationId: tasks.organizationId, recipientUserId, dueAt: tasks.dueAt })
          .from(tasks)
          .innerJoin(authMember, and(eq(authMember.organizationId, tasks.organizationId), eq(authMember.userId, recipientUserId)))
          .where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, 'open'), lte(tasks.dueAt, now)))
          .orderBy(asc(tasks.dueAt), asc(tasks.id)).limit(limit).for('update', { of: tasks, skipLocked: true });
        let tenantCreatedCount = 0;
        for (const task of overdueTasks) {
          const [created] = await transaction.insert(userNotifications).values({
            organizationId: task.organizationId,
            recipientUserId: task.recipientUserId,
            taskId: task.id,
            notificationType: 'task_overdue',
            idempotencyKey: `task-overdue:${task.id}:${task.recipientUserId}:${task.dueAt.toISOString()}`,
          }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] }).returning({ id: userNotifications.id });
          if (created) tenantCreatedCount += 1;
        }
        return tenantCreatedCount;
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
}
