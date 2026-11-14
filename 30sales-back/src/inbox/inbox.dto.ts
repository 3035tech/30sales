import { z } from 'zod';
import { conversationStatus, messageActorType, messageDeliveryState, messageDirection } from '../db/schema';

export const listConversationsSchema = z.object({ status: z.enum(conversationStatus.enumValues).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListConversationsQueryDto = z.infer<typeof listConversationsSchema>;
export class ConversationRepositoryListDto { constructor(readonly organizationId: string, readonly query: ListConversationsQueryDto) {} }
export class ConversationListItemDto {
  constructor(readonly id: string, readonly provider: string, readonly status: (typeof conversationStatus.enumValues)[number], readonly accountName: string | null, readonly personName: string | null, readonly lastMessageAt: string | null, readonly createdAt: string) {}
}
export class MessageRecordDto {
  constructor(readonly id: string, readonly direction: (typeof messageDirection.enumValues)[number], readonly actorType: (typeof messageActorType.enumValues)[number], readonly bodyText: string | null, readonly deliveryState: (typeof messageDeliveryState.enumValues)[number], readonly occurredAt: string) {}
}
export class ConversationMessagesQueryDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly limit: number, readonly offset: number) {} }
