import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesRepository } from './opportunities.repository';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityActivitiesRepository } from './activities.repository';

@Module({ controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesRepository, OpportunityActivitiesRepository, TenantAccessService] })
export class OpportunitiesModule {}
