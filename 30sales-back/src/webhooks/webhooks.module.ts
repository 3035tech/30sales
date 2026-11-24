import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { EvolutionHistoryWorker } from './evolution-history.worker';

@Module({ imports: [ChannelsModule, AttachmentsModule], controllers: [WebhooksController], providers: [WebhooksService, WebhooksRepository, EvolutionHistoryWorker], exports: [WebhooksService] })
export class WebhooksModule {}
