import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { InboxModule } from '../inbox/inbox.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AgentsController, AssistantProfilesController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { AssistantLanguageModelService } from './assistant-language-model.service';
import { AssistantRuntimeRepository } from './assistant-runtime.repository';
import { AssistantRuntimeWorker } from './assistant-runtime.worker';
import { AssistantAudioTranscriptionService } from './assistant-audio-transcription.service';

@Module({ imports: [ChannelsModule, AttachmentsModule, InboxModule, WebhooksModule], controllers: [AgentsController, AssistantProfilesController], providers: [AgentsService, AgentsRepository, AssistantLanguageModelService, AssistantAudioTranscriptionService, AssistantRuntimeRepository, AssistantRuntimeWorker] })
export class AgentsModule {}
