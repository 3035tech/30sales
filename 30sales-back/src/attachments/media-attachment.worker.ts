import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { AttachmentsRepository } from './attachments.repository';
import { MediaDownloadProvider } from './media-download.provider';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';
import { MAX_EVOLUTION_INBOUND_MEDIA_BYTES, MAX_META_CLOUD_INBOUND_MEDIA_BYTES } from './media-limits.constants';
import { MEDIA_ATTACHMENT_ERROR_STAGE, MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR } from './media-attachment.constants';

const SAFE_ERROR_CODES = new Set(['MEDIA_SOURCE_INVALID', 'MEDIA_PROVIDER_UNAVAILABLE', MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR, 'MEDIA_PROVIDER_RESPONSE_INVALID', 'MEDIA_SIZE_LIMIT_EXCEEDED', 'MEDIA_CHECKSUM_MISMATCH', 'MEDIA_PROVIDER_REDIRECT_INVALID', 'MEDIA_PROVIDER_URL_INVALID']);

@Injectable()
export class MediaAttachmentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaAttachmentWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: AttachmentsRepository, private readonly credentialCrypto: ChannelCredentialCryptoService,
    private readonly credentialResolver: ChannelCredentialResolverService,
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
    } catch {
      this.logger.error('Media attachment polling failed');
    } finally {
      this.processing = false;
    }
  }

  private async processOne(attachment: Awaited<ReturnType<AttachmentsRepository['claimPending']>>[number]): Promise<void> {
    let stage: string = MEDIA_ATTACHMENT_ERROR_STAGE.sourceValidation;
    this.logAttachment('started', attachment, stage);
    try {
      const maximumMediaBytes = attachment.provider === 'evolution' ? MAX_EVOLUTION_INBOUND_MEDIA_BYTES : MAX_META_CLOUD_INBOUND_MEDIA_BYTES;
      if (attachment.sizeBytes !== null && attachment.sizeBytes > maximumMediaBytes) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
      stage = MEDIA_ATTACHMENT_ERROR_STAGE.credentialsResolution;
      const credentials = await this.credentialResolver.resolve(attachment.organizationId, attachment.channelId, {
        ciphertext: attachment.credentialsCiphertext, iv: attachment.credentialsIv, authTag: attachment.credentialsAuthTag,
      });
      stage = MEDIA_ATTACHMENT_ERROR_STAGE.sourceDecryption;
      const sourcePayload = this.credentialCrypto.decryptPayload(attachment.organizationId, attachment.channelId, {
        ciphertext: attachment.sourceCiphertext, iv: attachment.sourceIv, authTag: attachment.sourceAuthTag,
      });
      stage = MEDIA_ATTACHMENT_ERROR_STAGE.evolutionDownload;
      const media = await this.provider.download({ provider: attachment.provider, providerChannelId: attachment.providerChannelId,
        mediaId: attachment.sourceMediaId, sourcePayload, credentials });
      this.logAttachment('completed', attachment, stage);
      stage = MEDIA_ATTACHMENT_ERROR_STAGE.s3Upload;
      const storageKey = await this.storage.put(attachment.organizationId, attachment.id, media.content, media.mimeType);
      this.logAttachment('completed', attachment, stage);
      const fileName = media.fileName?.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 255) ?? null;
      stage = MEDIA_ATTACHMENT_ERROR_STAGE.databaseFinalize;
      await this.repository.markAvailable(attachment, storageKey, media.mimeType, fileName, media.content.byteLength, media.sha256);
      this.logAttachment('completed', attachment, 'database_finalize');
    } catch (error) {
      const code = error instanceof Error && SAFE_ERROR_CODES.has(error.message) ? error.message : 'MEDIA_DOWNLOAD_FAILED';
      const errorStage = code === 'MEDIA_PROVIDER_UNAVAILABLE' || code === MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR ? MEDIA_ATTACHMENT_ERROR_STAGE.evolutionFetch : code === 'MEDIA_PROVIDER_RESPONSE_INVALID' ? MEDIA_ATTACHMENT_ERROR_STAGE.evolutionResponse : stage;
      this.logAttachment('failed', attachment, errorStage, code);
      try { await this.repository.markFailed(attachment, code, errorStage); }
      catch { this.logger.error(JSON.stringify({ event: 'media_attachment', outcome: 'state_update_failed', attachmentId: attachment.id, correlationId: attachment.id, channelId: attachment.channelId })); }
    }
  }

  private logAttachment(outcome: string, attachment: { id: string; organizationId: string; channelId: string; provider: string; mediaType: string; attemptCount: number }, stage: string, errorCode?: string): void {
    this.logger.log(JSON.stringify({ event: 'media_attachment', outcome, stage, attachmentId: attachment.id, correlationId: attachment.id,
      organizationId: attachment.organizationId, channelId: attachment.channelId, provider: attachment.provider, mediaType: attachment.mediaType,
      attempt: attachment.attemptCount, ...(errorCode ? { errorCode } : {}) }));
  }
}
