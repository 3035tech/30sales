import { z } from 'zod';

export const userNotificationTypeValues = ['closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message', 'task_overdue', 'handoff_accepted', 'handoff_returned', 'conversation_assigned', 'opportunity_assigned'] as const;
export type UserNotificationType = typeof userNotificationTypeValues[number];
export const listNotificationsSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export type ListNotificationsQueryDto = z.infer<typeof listNotificationsSchema>;
export class UserNotificationsListDto { constructor(readonly organizationId: string, readonly userId: string, readonly limit: number) {} }
export class UserNotificationDto {
  constructor(readonly id: string, readonly notificationType: UserNotificationType, readonly conversationId: string | null, readonly taskId: string | null, readonly handoffId: string | null, readonly opportunityId: string | null, readonly taskTitle: string | null, readonly eventType: string | null, readonly summary: string, readonly accountName: string | null, readonly contactName: string | null, readonly dueAt: string | null, readonly createdAt: string) {}
}
export class UserNotificationsPageDto { constructor(readonly data: UserNotificationDto[], readonly unreadCount: number) {} }
export class MarkUserNotificationReadDto { constructor(readonly id: string, readonly organizationId: string, readonly userId: string) {} }
export class MarkAllUserNotificationsReadDto { constructor(readonly organizationId: string, readonly userId: string) {} }
