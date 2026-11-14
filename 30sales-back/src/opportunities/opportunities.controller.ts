import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listOpportunitiesSchema, transitionOpportunitySchema } from './opportunities.dto';
import type { ListOpportunitiesQueryDto, TransitionOpportunityDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

const opportunityIdSchema = z.string().uuid();
@Controller('api/v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listOpportunitiesSchema)) query: ListOpportunitiesQueryDto) {
    return this.opportunitiesService.list(request, query);
  }
  @Get(':id/history')
  history(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string) {
    return this.opportunitiesService.history(request, opportunityId);
  }
  @Patch(':id/stage')
  transition(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(opportunityIdSchema)) opportunityId: string, @Body(new ZodValidationPipe(transitionOpportunitySchema)) dto: TransitionOpportunityDto) {
    return this.opportunitiesService.transition(request, opportunityId, dto);
  }
}
