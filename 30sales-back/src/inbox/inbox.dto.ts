import { z } from 'zod';
import { conversationStatus, messageActorType, messageDeliveryState, messageDirection } from '../db/schema';

export const listConversationsSchema = z.object({ status: z.enum(conversationStatus.enumValues).optional(), channelId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListConversationsQueryDto = z.infer<typeof listConversationsSchema>;
export const conversationAutomationModeSchema = z.enum(['sofia', 'human', 'paused']);
export type ConversationAutomationMode = z.infer<typeof conversationAutomationModeSchema>;
export const assignConversationSchema = z.object({ ownerUserId: z.string().uuid() }).strict();
export type AssignConversationDto = z.infer<typeof assignConversationSchema>;
export class ConversationRepositoryListDto { constructor(readonly organizationId: string, readonly query: ListConversationsQueryDto) {} }
export class ConversationListItemDto {
  constructor(readonly id: string, readonly provider: string, readonly status: (typeof conversationStatus.enumValues)[number], readonly accountName: string | null, readonly personName: string | null, readonly lastMessageAt: string | null, readonly createdAt: string, readonly channelId: string | null, readonly channelName: string | null, readonly channelPhoneNumber: string | null, readonly channelProvider: string | null, readonly ownerUserId: string | null, readonly ownerName: string | null, readonly automationMode: ConversationAutomationMode) {}
}
export class ConversationControlDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class ConversationAutomationUpdateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly mode: ConversationAutomationMode, readonly correlationId: string | null = null) {} }
export class ConversationControlResultDto { constructor(readonly id: string, readonly ownerUserId: string | null, readonly automationMode: ConversationAutomationMode) {} }
export class ConversationAssignDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly ownerUserId: string, readonly correlationId: string | null = null) {} }
export class ConversationAssigneeDto { constructor(readonly id: string, readonly name: string, readonly role: string) {} }
export class MessageRecordDto {
  constructor(readonly id: string, readonly direction: (typeof messageDirection.enumValues)[number], readonly actorType: (typeof messageActorType.enumValues)[number], readonly bodyText: string | null, readonly deliveryState: (typeof messageDeliveryState.enumValues)[number], readonly occurredAt: string) {}
}
export class ConversationMessagesQueryDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly limit: number, readonly offset: number) {} }
