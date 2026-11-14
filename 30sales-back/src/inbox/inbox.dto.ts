import { z } from 'zod';
import { conversationStatus, messageActorType, messageDeliveryState, messageDirection } from '../db/schema';

export const listConversationsSchema = z.object({ status: z.enum(conversationStatus.enumValues).optional(), channelId: z.string().uuid().optional(), tagId: z.string().uuid().optional(), ownerUserId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(), search: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListConversationsQueryDto = z.infer<typeof listConversationsSchema>;
export const conversationAutomationModeSchema = z.enum(['sofia', 'human', 'paused']);
export type ConversationAutomationMode = z.infer<typeof conversationAutomationModeSchema>;
export const assignConversationSchema = z.object({ ownerUserId: z.string().uuid() }).strict();
export type AssignConversationDto = z.infer<typeof assignConversationSchema>;
export class ConversationRepositoryListDto { constructor(readonly organizationId: string, readonly query: ListConversationsQueryDto) {} }
export const createConversationTagSchema = z.object({ name: z.string().trim().min(2).max(32) }).strict();
export type CreateConversationTagDto = z.infer<typeof createConversationTagSchema>;
export class ConversationTagMutationDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly name: string, readonly correlationId: string | null = null) {} }
export class ConversationTagRemoveDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly tagId: string, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class ConversationTagDto { constructor(readonly id: string, readonly name: string) {} }
export class ConversationListItemDto {
  constructor(readonly id: string, readonly provider: string, readonly status: (typeof conversationStatus.enumValues)[number], readonly accountName: string | null, readonly personName: string | null, readonly lastMessageAt: string | null, readonly createdAt: string, readonly channelId: string | null, readonly channelName: string | null, readonly channelPhoneNumber: string | null, readonly channelProvider: string | null, readonly ownerUserId: string | null, readonly ownerName: string | null, readonly automationMode: ConversationAutomationMode, readonly replyAvailable: boolean, readonly tags: ConversationTagDto[] = []) {}
}
export class ConversationPageDto { constructor(readonly data: ConversationListItemDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class ConversationControlDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class ConversationAutomationUpdateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly mode: ConversationAutomationMode, readonly correlationId: string | null = null) {} }
export class ConversationControlResultDto { constructor(readonly id: string, readonly ownerUserId: string | null, readonly automationMode: ConversationAutomationMode) {} }
export class ConversationAssignDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly ownerUserId: string, readonly correlationId: string | null = null) {} }
export class ConversationAssigneeDto { constructor(readonly id: string, readonly name: string, readonly role: string) {} }
export const sendConversationMessageSchema = z.object({ bodyText: z.string().trim().min(1).max(4096), idempotencyKey: z.string().uuid() }).strict();
export type SendConversationMessageDto = z.infer<typeof sendConversationMessageSchema>;
export const createConversationNoteSchema = z.object({ bodyText: z.string().trim().min(1).max(4096), idempotencyKey: z.string().uuid() }).strict();
export type CreateConversationNoteDto = z.infer<typeof createConversationNoteSchema>;
export class ConversationNoteCreateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly bodyText: string, readonly idempotencyKey: string, readonly correlationId: string | null = null) {} }
export class ConversationMessageSendDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly bodyText: string, readonly idempotencyKey: string, readonly correlationId: string | null = null) {} }
export class ConversationMessageDeliveryDto { constructor(readonly organizationId: string, readonly messageId: string, readonly actorUserId: string, readonly deliveryState: 'accepted' | 'failed' | 'unknown', readonly externalMessageId: string | null, readonly correlationId: string | null = null) {} }
export class MessageRecordDto {
  constructor(readonly id: string, readonly direction: (typeof messageDirection.enumValues)[number], readonly actorType: (typeof messageActorType.enumValues)[number], readonly bodyText: string | null, readonly deliveryState: (typeof messageDeliveryState.enumValues)[number], readonly occurredAt: string, readonly actorUserId: string | null = null, readonly actorName: string | null = null) {}
}
export class ConversationMessagesQueryDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly limit: number, readonly offset: number) {} }
