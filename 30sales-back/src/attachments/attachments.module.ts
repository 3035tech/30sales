import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentsService } from './attachments.service';
import { MediaAttachmentWorker } from './media-attachment.worker';
import { MediaDownloadProvider } from './media-download.provider';
import { EvolutionInboundMediaAdapter } from './evolution-inbound-media.adapter';
import { MetaCloudInboundMediaAdapter } from './meta-cloud-inbound-media.adapter';
import { S3MediaStorageService } from './s3-media-storage.service';
import { MEDIA_STORAGE } from './media-storage';

@Module({ imports: [ChannelsModule], controllers: [AttachmentsController], providers: [AttachmentsService, AttachmentsRepository, MediaAttachmentWorker, MediaDownloadProvider, EvolutionInboundMediaAdapter, MetaCloudInboundMediaAdapter, S3MediaStorageService, { provide: MEDIA_STORAGE, useExisting: S3MediaStorageService }], exports: [MEDIA_STORAGE] })
export class AttachmentsModule {}
