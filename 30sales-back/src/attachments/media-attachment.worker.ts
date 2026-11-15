import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { AttachmentsRepository } from './attachments.repository';
import { MediaDownloadProvider } from './media-download.provider';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const SAFE_ERROR_CODES = new Set(['MEDIA_SOURCE_INVALID', 'MEDIA_PROVIDER_UNAVAILABLE', 'MEDIA_PROVIDER_RESPONSE_INVALID', 'MEDIA_SIZE_LIMIT_EXCEEDED', 'MEDIA_CHECKSUM_MISMATCH', 'MEDIA_PROVIDER_REDIRECT_INVALID', 'MEDIA_PROVIDER_URL_INVALID']);

@Injectable()
export class MediaAttachmentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaAttachmentWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: AttachmentsRepository, private readonly credentials: ChannelCredentialCryptoService,
    private readonly provider: MediaDownloadProvider, @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processPending() }, 5_000);
    this.timer.unref();
    void this.processPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const batch = await this.repository.claimPending(1);
      for (const attachment of batch) await this.processOne(attachment);
    } catch (error) {
      this.logger.error(`Media attachment polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }

  private async processOne(attachment: Awaited<ReturnType<AttachmentsRepository['claimPending']>>[number]): Promise<void> {
    try {
      if (attachment.sizeBytes !== null && attachment.sizeBytes > MAX_MEDIA_BYTES) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
      const credentials = this.credentials.decrypt(attachment.organizationId, attachment.channelId, {
        ciphertext: attachment.credentialsCiphertext, iv: attachment.credentialsIv, authTag: attachment.credentialsAuthTag,
      });
      const sourcePayload = this.credentials.decryptPayload(attachment.organizationId, attachment.channelId, {
        ciphertext: attachment.sourceCiphertext, iv: attachment.sourceIv, authTag: attachment.sourceAuthTag,
      });
      const media = await this.provider.download({ provider: attachment.provider, providerChannelId: attachment.providerChannelId,
        mediaId: attachment.sourceMediaId, sourcePayload, credentials });
      const storageKey = await this.storage.put(attachment.organizationId, attachment.id, media.content);
      const fileName = media.fileName?.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 255) ?? null;
      await this.repository.markAvailable(attachment, storageKey, media.mimeType, fileName, media.content.byteLength, media.sha256);
    } catch (error) {
      const code = error instanceof Error && SAFE_ERROR_CODES.has(error.message) ? error.message : 'MEDIA_DOWNLOAD_FAILED';
      try { await this.repository.markFailed(attachment, code); }
      catch (markError) { this.logger.error(`Media attachment state update failed: ${markError instanceof Error ? markError.message : 'unknown error'}`); }
    }
  }
}
