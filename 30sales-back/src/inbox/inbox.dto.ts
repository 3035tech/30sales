import { z } from 'zod';
import type { MessageAttachmentDto } from '../attachments/attachments.dto';
import { conversationStatus, messageActorType, messageDeliveryState, messageDirection } from '../db/schema';
import type { MessageProviderMetadata } from '../db/schema';
import type { OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';

export const listConversationsSchema = z.object({ conversationId: z.string().uuid().optional(), businessLineId: z.string().uuid().optional(), status: z.enum(conversationStatus.enumValues).optional(), channelId: z.string().uuid().optional(), tagId: z.string().uuid().optional(), ownerUserId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(), search: z.string().trim().max(120).optional(), unreadOnly: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListConversationsQueryDto = z.infer<typeof listConversationsSchema>;
export const conversationAutomationModeSchema = z.enum(['assistant', 'human', 'paused']);
export type ConversationAutomationMode = z.infer<typeof conversationAutomationModeSchema>;
export const conversationStatusUpdateSchema = z.object({ status: z.enum(['open', 'resolved']) }).strict();
export type ConversationStatusUpdateInputDto = z.infer<typeof conversationStatusUpdateSchema>;
export const assignConversationSchema = z.object({ ownerUserId: z.string().uuid() }).strict();
export type AssignConversationDto = z.infer<typeof assignConversationSchema>;
export const reconcileConversationContactSchema = z.object({ leadId: z.string().uuid(), name: z.string().trim().min(2).max(160).optional(), phone: z.string().trim().min(8).max(40).optional(), isPrimary: z.boolean().default(false), isInterested: z.boolean().default(false) }).strict();
export type ReconcileConversationContactInputDto = z.infer<typeof reconcileConversationContactSchema>;
export class ConversationContactReconcileDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly leadId: string, readonly name: string | undefined, readonly phone: string | undefined, readonly isPrimary: boolean, readonly isInterested: boolean, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationContactReconcileResultDto { constructor(readonly conversationId: string, readonly leadId: string, readonly accountName: string, readonly contactName: string, readonly phone: string | null) {} }
export const markConversationReadSchema = z.object({ lastInboundMessageId: z.string().uuid().nullable() }).strict();
export type MarkConversationReadInputDto = z.infer<typeof markConversationReadSchema>;
export class ConversationRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly query: ListConversationsQueryDto) {} }
export const createConversationTagSchema = z.object({ name: z.string().trim().min(2).max(32), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#dbeafe') }).strict();
export type CreateConversationTagDto = z.infer<typeof createConversationTagSchema>;
export class ConversationTagMutationDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly name: string, readonly color: string, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationTagRemoveDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly tagId: string, readonly actorUserId: string, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationTagDto { constructor(readonly id: string, readonly name: string, readonly color = '#dbeafe') {} }
export class AssistantQualificationDto { constructor(readonly intent: string, readonly summary: string, readonly confirmedFacts: string[], readonly unknowns: string[], readonly nextStep: string, readonly updatedAt: string) {} }
export class ConversationLeadSummaryDto { constructor(readonly status: string, readonly source: string, readonly nextActionAt: string | null) {} }
export class ConversationListItemDto {
  constructor(readonly id: string, readonly provider: string, readonly status: (typeof conversationStatus.enumValues)[number], readonly accountName: string | null, readonly personName: string | null, readonly personEmail: string | null, readonly personPhone: string | null, readonly lead: ConversationLeadSummaryDto | null, readonly lastMessageAt: string | null, readonly createdAt: string, readonly channelId: string | null, readonly channelName: string | null, readonly channelPhoneNumber: string | null, readonly channelProvider: string | null, readonly ownerUserId: string | null, readonly ownerName: string | null, readonly automationMode: ConversationAutomationMode, readonly replyAvailable: boolean, readonly unread: boolean, readonly tags: ConversationTagDto[] = [], readonly assistantQualification: AssistantQualificationDto | null = null, readonly businessLineId: string | null = null, readonly businessLineName: string | null = null, readonly providerArchived: boolean | null = null, readonly providerPinned: boolean | null = null, readonly providerUnreadCount: number | null = null, readonly providerDeleted: boolean | null = null, readonly conversationType: 'direct' | 'group' = 'direct', readonly displayName: string | null = null, readonly lastMessagePreview: string | null = null, readonly lastMessageDirection: 'inbound' | 'outbound' | 'internal' | null = null, readonly lastMessageDeliveryState: (typeof messageDeliveryState.enumValues)[number] | null = null, readonly firstUnreadMessageId: string | null = null, readonly lastMessagePreviewKind: 'text' | 'encrypted_reaction' | 'non_text' | null = null) {}
}
export class ConversationPageDto { constructor(readonly data: ConversationListItemDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class ConversationControlDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationAutomationUpdateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly mode: ConversationAutomationMode, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationStatusUpdateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly status: 'open' | 'resolved', readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationControlResultDto { constructor(readonly id: string, readonly ownerUserId: string | null, readonly automationMode: ConversationAutomationMode) {} }
export class ConversationAssignDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly ownerUserId: string, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationAssigneeDto { constructor(readonly id: string, readonly name: string, readonly role: string) {} }
export const sendConversationMessageSchema = z.object({ bodyText: z.string().trim().min(1).max(4096), idempotencyKey: z.string().uuid(), targetMessageId: z.string().uuid().optional(), mode: z.enum(['reply', 'reaction']).default('reply') }).strict();
export const hideConversationMessageSchema = z.object({}).strict();
export type SendConversationMessageDto = z.infer<typeof sendConversationMessageSchema>;
export const sendConversationMediaSchema = z.object({ bodyText: z.string().trim().max(4096).optional(), idempotencyKey: z.string().uuid() }).strict();
export type SendConversationMediaDto = z.infer<typeof sendConversationMediaSchema>;
export const sendConversationContactSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phoneNumber: z.string().trim().min(8).max(40),
  organization: z.string().trim().max(160).optional(),
  email: z.email().max(254).optional(),
  url: z.url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  idempotencyKey: z.string().uuid(),
}).strict();
export type SendConversationContactDto = z.infer<typeof sendConversationContactSchema>;
export type OutboundMediaInputDto = { readonly id: string; readonly mediaType: typeof OUTBOUND_MEDIA_TYPE[keyof typeof OUTBOUND_MEDIA_TYPE]; readonly mimeType: string; readonly fileName: string; readonly sizeBytes: number; readonly sha256: string };
export const createConversationNoteSchema = z.object({ bodyText: z.string().trim().min(1).max(4096), idempotencyKey: z.string().uuid() }).strict();
export type CreateConversationNoteDto = z.infer<typeof createConversationNoteSchema>;
export class ConversationNoteCreateDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly bodyText: string, readonly idempotencyKey: string, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationMessageSendDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly actorUserId: string, readonly bodyText: string | null, readonly idempotencyKey: string, readonly correlationId: string | null = null, readonly attachment: OutboundMediaInputDto | null = null, readonly isPlatformOrganizationContext = false, readonly targetMessageId: string | null = null, readonly mode: 'reply' | 'reaction' = 'reply') {} }
export class ConversationMessageDeliveryDto { constructor(readonly organizationId: string, readonly messageId: string, readonly actorUserId: string, readonly deliveryState: 'accepted' | 'failed' | 'unknown', readonly externalMessageId: string | null, readonly correlationId: string | null = null) {} }
export class MessageRecordDto {
  constructor(readonly id: string, readonly direction: (typeof messageDirection.enumValues)[number], readonly actorType: (typeof messageActorType.enumValues)[number], readonly bodyText: string | null, readonly deliveryState: (typeof messageDeliveryState.enumValues)[number], readonly occurredAt: string, readonly actorUserId: string | null = null, readonly actorName: string | null = null, readonly attachments: MessageAttachmentDto[] = [], readonly transcriptText: string | null = null, readonly isDeleted = false, readonly providerMetadata: MessageProviderMetadata | null = null, readonly externalMessageId: string | null = null) {}
}
export class ConversationGroupParticipantsResultDto {
  constructor(readonly supported: boolean, readonly participants: Array<{ readonly id: string; readonly phone: string | null; readonly name: string | null; readonly isAdmin: boolean }>, readonly stale = false) {}
}
export class ConversationMessagesQueryDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly userId: string, readonly limit: number, readonly offset: number, readonly search = '', readonly isPlatformOrganizationContext = false) {} }
export class ConversationReadDto { constructor(readonly organizationId: string, readonly conversationId: string, readonly userId: string, readonly lastInboundMessageId: string | null, readonly correlationId: string | null = null, readonly isPlatformOrganizationContext = false) {} }
export class ConversationReadResultDto { constructor(readonly conversationId: string, readonly lastReadAt: string | null) {} }
