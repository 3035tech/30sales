import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignOpportunityOwnerSchema, createPipelineSchema, createPipelineStageSchema, listOpportunitiesSchema, reorderPipelineStagesSchema, transitionOpportunitySchema, updatePipelineSchema, updatePipelineStageSchema } from './opportunities.dto';
import type { AssignOpportunityOwnerDto, CreatePipelineDto, CreatePipelineStageDto, ListOpportunitiesQueryDto, ReorderPipelineStagesDto, TransitionOpportunityDto, UpdatePipelineDto, UpdatePipelineStageDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';
import { createActivitySchema } from './activities.dto';
import type { CreateActivityDto } from './activities.dto';

const opportunityIdSchema = z.string().uuid();
const pipelineStageKeySchema = z.string().min(1).max(64);
const pipelineQuerySchema = z.object({ pipelineId: z.string().uuid().optional() }).strict();
@Controller('api/v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}
  @Get('pipelines')
  pipelines(@ApiRequest() request: ApiRequestDto) { return this.opportunitiesService.pipelines(request); }
  @Post('pipelines')
  createPipeline(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createPipelineSchema)) dto: CreatePipelineDto) { return this.opportunitiesService.createPipeline(request, dto); }
  @Patch('pipelines/:id')
  updatePipeline(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) pipelineId: string, @Body(new ZodValidationPipe(updatePipelineSchema)) dto: UpdatePipelineDto) { return this.opportunitiesService.updatePipeline(request, pipelineId, dto); }
  @Patch('pipelines/:id/default')
  setDefaultPipeline(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) pipelineId: string) { return this.opportunitiesService.setDefaultPipeline(request, pipelineId); }
  @Delete('pipelines/:id')
  archivePipeline(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) pipelineId: string) { return this.opportunitiesService.archivePipeline(request, pipelineId); }
  @Get('pipeline-stages')
  pipelineStages(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(pipelineQuerySchema)) query: { pipelineId?: string }) { return this.opportunitiesService.pipelineStages(request, query.pipelineId); }
  @Post('pipeline-stages')
  createPipelineStage(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createPipelineStageSchema)) dto: CreatePipelineStageDto) { return this.opportunitiesService.createPipelineStage(request, dto); }
  @Patch('pipeline-stages/order')
  reorderPipelineStages(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(reorderPipelineStagesSchema)) dto: ReorderPipelineStagesDto) { return this.opportunitiesService.reorderPipelineStages(request, dto); }
  @Patch('pipeline-stages/:key')
  updatePipelineStage(@ApiRequest() request: ApiRequestDto, @Param('key', new ZodValidationPipe(pipelineStageKeySchema)) key: string, @Body(new ZodValidationPipe(updatePipelineStageSchema)) dto: UpdatePipelineStageDto) { return this.opportunitiesService.updatePipelineStage(request, key, dto); }
  @Delete('pipeline-stages/:key')
  archivePipelineStage(@ApiRequest() request: ApiRequestDto, @Param('key', new ZodValidationPipe(pipelineStageKeySchema)) key: string, @Query(new ZodValidationPipe(pipelineQuerySchema)) query: { pipelineId?: string }) { return this.opportunitiesService.archivePipelineStage(request, key, query.pipelineId); }
  @Get('summary')
  summary(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listOpportunitiesSchema)) query: ListOpportunitiesQueryDto) {
    return this.opportunitiesService.summary(request, query);
  }
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
  @Get(':id/conversation-contexts')
  conversationContexts(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string) {
    return this.opportunitiesService.conversationContexts(request, opportunityId);
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
