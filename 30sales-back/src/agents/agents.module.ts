import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { InboxModule } from '../inbox/inbox.module';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { SofiaLanguageModelService } from './sofia-language-model.service';
import { SofiaRuntimeRepository } from './sofia-runtime.repository';
import { SofiaRuntimeWorker } from './sofia-runtime.worker';

@Module({ imports: [ChannelsModule, InboxModule], controllers: [AgentsController], providers: [AgentsService, AgentsRepository, SofiaLanguageModelService, SofiaRuntimeRepository, SofiaRuntimeWorker, TenantAccessService] })
export class AgentsModule {}
