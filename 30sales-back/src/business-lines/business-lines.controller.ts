import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { BUSINESS_LINES_API_PATH } from '../auth/authorization.constants';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { businessLineIdSchema, createBusinessLineSchema, setBusinessLineMembersSchema, updateBusinessLineSchema, type CreateBusinessLineDto, type SetBusinessLineMembersDto, type UpdateBusinessLineDto } from './business-lines.dto';
import { BusinessLinesService } from './business-lines.service';

@Controller(BUSINESS_LINES_API_PATH)
export class BusinessLinesController {
  constructor(private readonly businessLines: BusinessLinesService) {}

  @Get()
  list(@ApiRequest() request: ApiRequestDto) { return this.businessLines.list(request); }

  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createBusinessLineSchema)) input: CreateBusinessLineDto) { return this.businessLines.create(request, input); }

  @Patch(':businessLineId')
  update(@ApiRequest() request: ApiRequestDto, @Param('businessLineId', new ZodValidationPipe(businessLineIdSchema)) businessLineId: string, @Body(new ZodValidationPipe(updateBusinessLineSchema)) input: UpdateBusinessLineDto) { return this.businessLines.update(request, businessLineId, input); }

  @Get(':businessLineId/members')
  members(@ApiRequest() request: ApiRequestDto, @Param('businessLineId', new ZodValidationPipe(businessLineIdSchema)) businessLineId: string) { return this.businessLines.listMembers(request, businessLineId); }

  @Put(':businessLineId/members')
  setMembers(@ApiRequest() request: ApiRequestDto, @Param('businessLineId', new ZodValidationPipe(businessLineIdSchema)) businessLineId: string, @Body(new ZodValidationPipe(setBusinessLineMembersSchema)) input: SetBusinessLineMembersDto) { return this.businessLines.setMembers(request, businessLineId, input); }
}
