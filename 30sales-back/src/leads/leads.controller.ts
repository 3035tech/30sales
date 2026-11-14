import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createLeadSchema, listLeadsSchema, updateLeadStatusSchema } from './leads.dto';
import type { CreateLeadDto, ListLeadsQueryDto, UpdateLeadStatusDto } from './leads.dto';
import { LeadsService } from './leads.service';
import { z } from 'zod';

const leadIdSchema = z.string().uuid();
@Controller('api/v1/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listLeadsSchema)) query: ListLeadsQueryDto) {
    return this.leadsService.list(request, query);
  }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto) {
    return this.leadsService.create(request, dto);
  }
  @Patch(':id/status')
  updateStatus(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(updateLeadStatusSchema)) dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(request, leadId, dto);
  }
}
