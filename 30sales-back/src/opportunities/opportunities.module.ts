import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesRepository } from './opportunities.repository';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityActivitiesRepository } from './activities.repository';
import { PipelineStagesRepository } from './pipeline-stages.repository';
import { PipelinesRepository } from './pipelines.repository';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({ imports: [AttachmentsModule], controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesRepository, OpportunityActivitiesRepository, PipelineStagesRepository, PipelinesRepository] })
export class OpportunitiesModule {}
