import { z } from 'zod';

export type WebhookProvider = 'evolution' | 'whatsapp_cloud_api';
export type InboundMediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

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
    readonly senderPhone: string,
    readonly senderName: string | null,
    readonly messageType: string,
    readonly closerSignal: 'human_requested' | 'buying_intent' | 'question' | null,
    readonly bodyText: string | null,
    readonly occurredAt: Date,
    readonly payloadHash: string,
    readonly media: InboundMediaDto | null = null,
  ) {}
}

export type MessageDeliveryState = 'accepted' | 'delivered' | 'read' | 'failed';

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
