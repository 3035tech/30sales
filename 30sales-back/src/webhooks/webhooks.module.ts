import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { EvolutionHistoryWorker } from './evolution-history.worker';
import { EvolutionMessageStatusReconciliationWorker } from './evolution-message-status-reconciliation.worker';
import { EvolutionMessageStatusWebhookAdapter, MetaCloudMessageStatusWebhookAdapter } from './message-status-webhook-adapters';
import { EvolutionIncomingMessageWebhookAdapter, MetaCloudIncomingMessageWebhookAdapter } from './incoming-message-webhook-adapters';

@Module({ imports: [ChannelsModule, AttachmentsModule], controllers: [WebhooksController], providers: [WebhooksService, WebhooksRepository, EvolutionHistoryWorker, EvolutionMessageStatusReconciliationWorker, EvolutionMessageStatusWebhookAdapter, MetaCloudMessageStatusWebhookAdapter, EvolutionIncomingMessageWebhookAdapter, MetaCloudIncomingMessageWebhookAdapter], exports: [WebhooksService] })
export class WebhooksModule {}
