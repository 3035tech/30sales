import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesRepository } from './opportunities.repository';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityActivitiesRepository } from './activities.repository';
import { PipelineStagesRepository } from './pipeline-stages.repository';

@Module({ controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesRepository, OpportunityActivitiesRepository, PipelineStagesRepository, TenantAccessService] })
export class OpportunitiesModule {}
