import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AttachmentsRepository } from './attachments.repository';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';
import { RetryMediaAttachmentDto } from './attachments.dto';

@Injectable()
export class AttachmentsService {
  constructor(private readonly access: TenantAccessService, private readonly repository: AttachmentsRepository, @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  async download(request: ApiRequestDto, attachmentId: string): Promise<{ stream: Awaited<ReturnType<MediaStorage['read']>>; fileName: string | null; mimeType: string | null }> {
    const context = await this.access.require(request, 'read', 'inbox');
    const attachment = await this.repository.authorizeDownload(context.organizationId, attachmentId, context.userId, request.correlationId);
    if (!attachment) throw new NotFoundException({ code: 'MESSAGE_ATTACHMENT_NOT_FOUND', message: 'The attachment was not found in the active organization.' });
    try {
      if (!await this.storage.exists(attachment.storageKey)) throw new Error('Media object is missing.');
      return { stream: await this.storage.read(attachment.storageKey), fileName: attachment.fileName, mimeType: attachment.mimeType };
    } catch {
      throw new ServiceUnavailableException({ code: 'MESSAGE_ATTACHMENT_UNAVAILABLE', message: 'The attachment content is temporarily unavailable.' });
    }
  }

  async retry(request: ApiRequestDto, attachmentId: string): Promise<RetryMediaAttachmentDto> {
    const context = await this.access.require(request, 'read', 'inbox');
    const result = await this.repository.retryFailed(context.organizationId, attachmentId, context.userId, request.correlationId);
    if (!result) throw new NotFoundException({ code: 'MESSAGE_ATTACHMENT_NOT_RETRYABLE', message: 'The failed attachment is not available for retry in the active organization.' });
    return result;
  }
}
