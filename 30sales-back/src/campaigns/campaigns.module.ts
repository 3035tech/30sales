import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';
import { ChannelsModule } from '../channels/channels.module';
import { InboxModule } from '../inbox/inbox.module';
import { CampaignOutreachWorker } from './campaign-outreach.worker';

@Module({ imports: [ChannelsModule, InboxModule], controllers: [CampaignsController], providers: [CampaignsService, CampaignsRepository, CampaignOutreachWorker, TenantAccessService] })
export class CampaignsModule {}
