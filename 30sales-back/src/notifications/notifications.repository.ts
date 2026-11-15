import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, closerEvents, conversations, people, userNotifications } from '../db/schema';
import { MarkUserNotificationReadDto, UserNotificationDto, UserNotificationsListDto, UserNotificationsPageDto, userNotificationTypeValues } from './notifications.dto';

@Injectable()
export class NotificationsRepository {
  async list(input: UserNotificationsListDto): Promise<UserNotificationsPageDto> {
    const rows = await database.select({
      id: userNotifications.id,
      notificationType: userNotifications.notificationType,
      conversationId: sql<string>`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`,
      eventType: closerEvents.eventType,
      summary: sql<string>`case when ${userNotifications.notificationType} = 'inbox_new_message' then coalesce(${people.name}, ${accounts.name}, '') else ${closerEvents.summary} end`,
      accountName: accounts.name,
      contactName: people.name,
      dueAt: closerEvents.dueAt,
      createdAt: userNotifications.createdAt,
    }).from(userNotifications)
      .leftJoin(closerEvents, and(eq(closerEvents.id, userNotifications.closerEventId), eq(closerEvents.organizationId, userNotifications.organizationId)))
      .leftJoin(conversations, and(eq(conversations.id, sql`coalesce(${userNotifications.conversationId}, ${closerEvents.conversationId})`), eq(conversations.organizationId, userNotifications.organizationId)))
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt)))
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id)).limit(input.limit);
    const [count] = await database.select({ total: sql<number>`count(*)::int` }).from(userNotifications)
      .where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.recipientUserId, input.userId), isNull(userNotifications.readAt)));
    const data = rows.flatMap((row) => {
      const notificationType = userNotificationTypeValues.find((value) => value === row.notificationType);
      return row.conversationId && notificationType ? [new UserNotificationDto(row.id, notificationType, row.conversationId, row.eventType, row.summary, row.accountName, row.contactName, row.dueAt?.toISOString() ?? null, row.createdAt.toISOString())] : [];
    });
    return new UserNotificationsPageDto(data, count?.total ?? 0);
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
