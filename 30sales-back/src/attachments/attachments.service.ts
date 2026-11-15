import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AttachmentsRepository } from './attachments.repository';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

@Injectable()
export class AttachmentsService {
  constructor(private readonly access: TenantAccessService, private readonly repository: AttachmentsRepository, @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  async download(request: ApiRequestDto, attachmentId: string): Promise<{ stream: Awaited<ReturnType<MediaStorage['read']>>; fileName: string | null }> {
    const context = await this.access.require(request, 'read', 'inbox');
    const attachment = await this.repository.authorizeDownload(context.organizationId, attachmentId, context.userId, request.correlationId);
    if (!attachment) throw new NotFoundException({ code: 'MESSAGE_ATTACHMENT_NOT_FOUND', message: 'The attachment was not found in the active organization.' });
    try {
      if (!await this.storage.exists(attachment.storageKey)) throw new Error('Media object is missing.');
      return { stream: await this.storage.read(attachment.storageKey), fileName: attachment.fileName };
    } catch {
      throw new ServiceUnavailableException({ code: 'MESSAGE_ATTACHMENT_UNAVAILABLE', message: 'The attachment content is temporarily unavailable.' });
    }
  }
}
