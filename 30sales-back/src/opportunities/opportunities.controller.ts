import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignOpportunityOwnerSchema, createPipelineStageSchema, listOpportunitiesSchema, reorderPipelineStagesSchema, transitionOpportunitySchema, updatePipelineStageSchema } from './opportunities.dto';
import type { AssignOpportunityOwnerDto, CreatePipelineStageDto, ListOpportunitiesQueryDto, ReorderPipelineStagesDto, TransitionOpportunityDto, UpdatePipelineStageDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';
import { createActivitySchema } from './activities.dto';
import type { CreateActivityDto } from './activities.dto';

const opportunityIdSchema = z.string().uuid();
const pipelineStageKeySchema = z.string().min(1).max(64);
@Controller('api/v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}
  @Get('pipeline-stages')
  pipelineStages(@ApiRequest() request: ApiRequestDto) { return this.opportunitiesService.pipelineStages(request); }
  @Post('pipeline-stages')
  createPipelineStage(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createPipelineStageSchema)) dto: CreatePipelineStageDto) { return this.opportunitiesService.createPipelineStage(request, dto); }
  @Patch('pipeline-stages/order')
  reorderPipelineStages(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(reorderPipelineStagesSchema)) dto: ReorderPipelineStagesDto) { return this.opportunitiesService.reorderPipelineStages(request, dto); }
  @Patch('pipeline-stages/:key')
  updatePipelineStage(@ApiRequest() request: ApiRequestDto, @Param('key', new ZodValidationPipe(pipelineStageKeySchema)) key: string, @Body(new ZodValidationPipe(updatePipelineStageSchema)) dto: UpdatePipelineStageDto) { return this.opportunitiesService.updatePipelineStage(request, key, dto); }
  @Delete('pipeline-stages/:key')
  archivePipelineStage(@ApiRequest() request: ApiRequestDto, @Param('key', new ZodValidationPipe(pipelineStageKeySchema)) key: string) { return this.opportunitiesService.archivePipelineStage(request, key); }
  @Get('page')
  page(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listOpportunitiesSchema)) query: ListOpportunitiesQueryDto) {
    return this.opportunitiesService.page(request, query);
  }
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listOpportunitiesSchema)) query: ListOpportunitiesQueryDto) {
    return this.opportunitiesService.list(request, query);
  }
  @Get('assignees')
  assignees(@ApiRequest() request: ApiRequestDto) { return this.opportunitiesService.listAssignees(request); }
  @Patch(':id/owner')
  assignOwner(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string, @Body(new ZodValidationPipe(assignOpportunityOwnerSchema)) dto: AssignOpportunityOwnerDto) {
    return this.opportunitiesService.assignOwner(request, opportunityId, dto);
  }
  @Get(':id/history')
  history(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string) {
    return this.opportunitiesService.history(request, opportunityId);
  }
  @Get(':id/activities')
  activities(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string) {
    return this.opportunitiesService.activities(request, opportunityId);
  }
  @Post(':id/activities')
  createActivity(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string, @Body(new ZodValidationPipe(createActivitySchema)) dto: CreateActivityDto) {
    return this.opportunitiesService.createActivity(request, opportunityId, dto);
  }
  @Patch(':id/stage')
  transition(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string, @Body(new ZodValidationPipe(transitionOpportunitySchema)) dto: TransitionOpportunityDto) {
    return this.opportunitiesService.transition(request, opportunityId, dto);
  }
}
