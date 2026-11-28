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
import { EvolutionPollResultsProvider } from './evolution-poll-results.provider';
import { EvolutionPollResultsWorker } from './evolution-poll-results.worker';
import { InboxModule } from '../inbox/inbox.module';

@Module({ imports: [ChannelsModule, AttachmentsModule, InboxModule], controllers: [WebhooksController], providers: [WebhooksService, WebhooksRepository, EvolutionHistoryWorker, EvolutionMessageStatusReconciliationWorker, EvolutionPollResultsWorker, EvolutionMessageStatusWebhookAdapter, MetaCloudMessageStatusWebhookAdapter, EvolutionIncomingMessageWebhookAdapter, MetaCloudIncomingMessageWebhookAdapter, EvolutionPollResultsProvider], exports: [WebhooksService] })
export class WebhooksModule {}
