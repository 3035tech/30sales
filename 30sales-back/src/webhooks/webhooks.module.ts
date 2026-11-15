import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';

@Module({ imports: [ChannelsModule], controllers: [WebhooksController], providers: [WebhooksService, WebhooksRepository], exports: [WebhooksService] })
export class WebhooksModule {}
