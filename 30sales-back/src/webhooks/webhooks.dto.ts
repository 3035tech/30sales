import { z } from 'zod';
import { PROVIDER_EVENT_FAMILY, PROVIDER_MESSAGE_DELIVERY_STATES } from './provider-webhook-events.constants';

export type WebhookProvider = 'evolution' | 'whatsapp_cloud_api';
export type ProviderEventFamily = (typeof PROVIDER_EVENT_FAMILY)[keyof typeof PROVIDER_EVENT_FAMILY];

export class ProviderWebhookEventDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly provider: WebhookProvider,
    readonly externalEventId: string,
    readonly eventType: string,
    readonly eventFamily: ProviderEventFamily,
    readonly payloadHash: string,
  ) {}
}

export class EvolutionContactUpdateDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly externalEventId: string,
    readonly phoneDigits: string,
    readonly displayName: string | null,
    readonly payloadHash: string,
  ) {}
}

export class EvolutionChatStateDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly externalEventId: string,
    readonly externalConversationId: string,
    readonly archived: boolean | null,
    readonly pinned: boolean | null,
    readonly unreadCount: number | null,
    readonly deleted: boolean | null,
    readonly payloadHash: string,
  ) {}
}

export class EvolutionGroupMetadataDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly externalEventId: string,
    readonly externalConversationId: string,
    readonly providerRecipientId: string,
    readonly displayName: string,
    readonly payloadHash: string,
  ) {}
}

export type EvolutionGroupParticipantChange = {
  externalParticipantId: string;
  phone: string | null;
  displayName: string | null;
  action: 'add' | 'remove' | 'promote' | 'demote';
};

export class EvolutionGroupParticipantsUpdateDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly externalEventId: string,
    readonly externalConversationId: string,
    readonly participants: EvolutionGroupParticipantChange[],
    readonly payloadHash: string,
  ) {}
}

export type EvolutionHistoryBatchDto = {
  id: string;
  organizationId: string;
  channelId: string;
  externalEventId: string;
  payloadCiphertext: string;
  payloadIv: string;
  payloadAuthTag: string;
  attempts: number;
};

export class EvolutionMessageMutationDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly externalMessageId: string,
    readonly externalEventId: string,
    readonly eventType: 'messages.edited' | 'messages.delete',
    readonly bodyText: string | null,
    readonly payloadHash: string,
  ) {}
}

export type InboundMediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';
export type EvolutionMessageMetadata = {
  source?: 'provider_echo';
  unsupportedType?: string;
  reaction: { targetExternalMessageId: string; emoji: string } | null;
  quotedMessage: { externalMessageId: string | null; bodyText: string | null } | null;
  richContent?: { kind: 'poll'; title: string; options: string[] } | { kind: 'card'; title: string | null; body: string | null; buttonLabel: string | null; buttonUrl: string | null } | null;
  author?: { name: string | null; phone: string | null } | null;
};

export class InboundMediaDto {
  constructor(
    readonly mediaType: InboundMediaType,
    readonly sourceMediaId: string | null,
    readonly sourceCiphertext: string,
    readonly sourceIv: string,
    readonly sourceAuthTag: string,
    readonly mimeType: string | null,
    readonly fileName: string | null,
    readonly sizeBytes: number | null,
    readonly sha256: string | null,
  ) {}
}

export type WebhookChannelDto = {
  id: string;
  organizationId: string;
  provider: string;
  providerChannelId: string;
  businessLineId: string | null;
  operationMode: string;
  inboundAssistantProfileId: string | null;
  outboundAssistantProfileId: string | null;
  isActive: boolean;
  credentialsCiphertext: string | null;
  credentialsIv: string | null;
  credentialsAuthTag: string | null;
};

export class IncomingWhatsappMessageDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly provider: WebhookProvider,
    readonly externalMessageId: string,
    readonly externalConversationId: string,
    readonly senderPhone: string | null,
    readonly senderExternalId: string | null,
    readonly senderName: string | null,
    readonly messageType: string,
    readonly closerSignal: 'human_requested' | 'buying_intent' | 'question' | null,
    readonly bodyText: string | null,
    readonly occurredAt: Date,
    readonly payloadHash: string,
    readonly media: InboundMediaDto | null = null,
    readonly evolutionMetadata: EvolutionMessageMetadata | null = null,
    readonly conversationType: 'direct' | 'group' = 'direct',
    readonly displayName: string | null = null,
    readonly providerRecipientId: string | null = null,
    readonly isFromMe = false,
  ) {}
}

const evolutionMessageMetadataSchema = z.object({
  source: z.literal('provider_echo').optional(),
  unsupportedType: z.string().min(1).max(80).optional(),
  reaction: z.object({ targetExternalMessageId: z.string().min(1).max(250), emoji: z.string().min(1).max(32) }).nullable(),
  quotedMessage: z.object({ externalMessageId: z.string().max(250).nullable(), bodyText: z.string().max(2000).nullable() }).nullable(),
  richContent: z.union([z.object({ kind: z.literal('poll'), title: z.string().max(4096), options: z.array(z.string().max(200)).max(20) }).strict(), z.object({ kind: z.literal('card'), title: z.string().max(500).nullable(), body: z.string().max(4096).nullable(), buttonLabel: z.string().max(120).nullable(), buttonUrl: z.string().url().max(2048).nullable() }).strict()]).nullable().optional(),
  author: z.object({ name: z.string().max(160).nullable(), phone: z.string().max(20).nullable() }).nullable().optional(),
}).strict();

export const evolutionHistoryMessageSchema = z.object({
  organizationId: z.string().uuid(), channelId: z.string().uuid(), provider: z.literal('evolution'),
  externalMessageId: z.string().min(1).max(250), externalConversationId: z.string().min(1).max(300),
  conversationType: z.enum(['direct', 'group']).optional().default('direct'), displayName: z.string().max(160).nullable().optional().default(null), providerRecipientId: z.string().max(250).nullable().optional().default(null),
  senderPhone: z.string().nullable(), senderExternalId: z.string().nullable(), senderName: z.string().nullable(),
  messageType: z.string().max(80), closerSignal: z.enum(['human_requested', 'buying_intent', 'question']).nullable(),
  bodyText: z.string().nullable(), occurredAt: z.coerce.date(), payloadHash: z.string().min(1), evolutionMetadata: evolutionMessageMetadataSchema.nullable().optional().default(null),
  media: z.object({ mediaType: z.enum(['image', 'video', 'audio', 'document', 'sticker']), sourceMediaId: z.string().nullable(), sourceCiphertext: z.string(), sourceIv: z.string(), sourceAuthTag: z.string(), mimeType: z.string().nullable(), fileName: z.string().nullable(), sizeBytes: z.number().int().nullable(), sha256: z.string().nullable() }).nullable(),
  isFromMe: z.boolean().optional().default(false),
}).strict();

export type MessageDeliveryState = (typeof PROVIDER_MESSAGE_DELIVERY_STATES)[number];

export class WhatsappMessageStatusDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly provider: WebhookProvider,
    readonly externalMessageId: string,
    readonly externalEventId: string,
    readonly deliveryState: MessageDeliveryState,
    readonly occurredAt: Date,
    readonly payloadHash: string,
  ) {}
}


export const interpretationFailureSignalSchema = z.object({
  externalConversationId: z.string().trim().min(1).max(300),
  externalMessageId: z.string().trim().min(1).max(250),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type InterpretationFailureSignalInputDto = z.infer<typeof interpretationFailureSignalSchema>;
export class InterpretationFailureSignalDto {
  constructor(
    readonly organizationId: string,
    readonly channelId: string,
    readonly provider: WebhookProvider,
    readonly input: InterpretationFailureSignalInputDto,
    readonly payloadHash: string,
  ) {}
}
