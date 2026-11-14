import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { closerEventActionSchema, listCloserEventsSchema } from './closer-events.dto';
import type { CloserEventActionInputDto, ListCloserEventsQueryDto } from './closer-events.dto';
import { CloserEventsService } from './closer-events.service';

@Controller('api/v1/closer-events')
export class CloserEventsController {
  constructor(private readonly closerEventsService: CloserEventsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listCloserEventsSchema)) query: ListCloserEventsQueryDto) { return this.closerEventsService.list(request, query); }
  @Get('assignees')
  assignees(@ApiRequest() request: ApiRequestDto) { return this.closerEventsService.assignees(request); }
  @Patch(':id/actions')
  act(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) eventId: string, @Body(new ZodValidationPipe(closerEventActionSchema)) input: CloserEventActionInputDto) { return this.closerEventsService.act(request, eventId, input); }
}
