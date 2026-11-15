import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentsService } from './attachments.service';
import { MediaAttachmentWorker } from './media-attachment.worker';
import { MediaDownloadProvider } from './media-download.provider';
import { MediaStorageService } from './media-storage.service';
import { MEDIA_STORAGE } from './media-storage';

@Module({ imports: [ChannelsModule], controllers: [AttachmentsController], providers: [AttachmentsService, AttachmentsRepository, MediaAttachmentWorker, MediaDownloadProvider, MediaStorageService, { provide: MEDIA_STORAGE, useExisting: MediaStorageService }, TenantAccessService] })
export class AttachmentsModule {}
