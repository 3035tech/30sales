export type WebhookProvider = 'evolution' | 'whatsapp_cloud_api';

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
    readonly bodyText: string | null,
    readonly occurredAt: Date,
    readonly payloadHash: string,
  ) {}
}

