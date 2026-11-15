import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { InboxModule } from '../inbox/inbox.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { AssistantLanguageModelService } from './assistant-language-model.service';
import { AssistantRuntimeRepository } from './assistant-runtime.repository';
import { AssistantRuntimeWorker } from './assistant-runtime.worker';

@Module({ imports: [ChannelsModule, InboxModule, WebhooksModule], controllers: [AgentsController], providers: [AgentsService, AgentsRepository, AssistantLanguageModelService, AssistantRuntimeRepository, AssistantRuntimeWorker, TenantAccessService] })
export class AgentsModule {}
