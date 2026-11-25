import type { WebhookProvider } from '../webhooks/webhooks.dto';
import type { mediaAttachmentStatus } from '../db/schema';

export type MediaAttachmentStatus = typeof mediaAttachmentStatus.enumValues[number];
export class MessageAttachmentDto {
  constructor(readonly id: string, readonly mediaType: string, readonly mimeType: string | null, readonly fileName: string | null, readonly sizeBytes: number | null, readonly status: MediaAttachmentStatus) {}
}
export class MediaAttachmentWorkDto {
  constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly channelId: string,
    readonly provider: WebhookProvider,
    readonly providerChannelId: string,
    readonly conversationId: string,
    readonly mediaType: string,
    readonly sourceMediaId: string | null,
    readonly sourceCiphertext: string,
    readonly sourceIv: string,
    readonly sourceAuthTag: string,
    readonly credentialsCiphertext: string,
    readonly credentialsIv: string,
    readonly credentialsAuthTag: string,
    readonly mimeType: string | null,
    readonly fileName: string | null,
    readonly sizeBytes: number | null,
    readonly sha256: string | null,
    readonly attemptCount: number,
  ) {}
}
export class MediaAttachmentDownloadDto {
  constructor(readonly storageKey: string, readonly fileName: string | null, readonly mimeType: string | null) {}
}
export class RetryMediaAttachmentDto {
  constructor(readonly id: string, readonly status: 'pending') {}
}
