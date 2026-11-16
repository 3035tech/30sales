import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';
import { ChannelsModule } from '../channels/channels.module';

@Module({ imports: [ChannelsModule], controllers: [CampaignsController], providers: [CampaignsService, CampaignsRepository, TenantAccessService] })
export class CampaignsModule {}
