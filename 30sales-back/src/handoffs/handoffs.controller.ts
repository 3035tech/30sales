import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createHandoffSchema, listHandoffsSchema, returnHandoffSchema } from './handoffs.dto';
import type { CreateHandoffDto, ListHandoffsQueryDto, ReturnHandoffDto } from './handoffs.dto';
import { HandoffsService } from './handoffs.service';

const handoffIdSchema = z.string().uuid();
@Controller('api/v1/handoffs')
export class HandoffsController {
  constructor(private readonly handoffsService: HandoffsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listHandoffsSchema)) query: ListHandoffsQueryDto) {
    return this.handoffsService.list(request, query);
  }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createHandoffSchema)) dto: CreateHandoffDto) {
    return this.handoffsService.create(request, dto);
  }
  @Patch(':id/accept')
  accept(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(handoffIdSchema)) handoffId: string) {
    return this.handoffsService.accept(request, handoffId);
  }
  @Patch(':id/return')
  returnToSdr(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(handoffIdSchema)) handoffId: string, @Body(new ZodValidationPipe(returnHandoffSchema)) dto: ReturnHandoffDto) {
    return this.handoffsService.returnToSdr(request, handoffId, dto);
  }
}
