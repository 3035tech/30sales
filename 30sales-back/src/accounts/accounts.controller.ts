import { Body, Controller, Get, Param, Post, Query, Patch } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { accountIdSchema, assignAccountSegmentSchema, createAccountSegmentSchema, listAccountsSchema, updateAccountProfileSchema } from './accounts.dto';
import type { AssignAccountSegmentDto, CreateAccountSegmentDto, ListAccountsQueryDto, UpdateAccountProfileDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@Controller('api/v1/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}
  @Get('table')
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listAccountsSchema)) query: ListAccountsQueryDto) {
    return this.accountsService.list(request, query);
  }
  @Get('segments')
  listSegments(@ApiRequest() request: ApiRequestDto) { return this.accountsService.listSegments(request); }
  @Post('segments')
  createSegment(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createAccountSegmentSchema)) body: CreateAccountSegmentDto) { return this.accountsService.createSegment(request, body); }
  @Patch(':accountId/segment')
  assignSegment(@ApiRequest() request: ApiRequestDto, @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string, @Body(new ZodValidationPipe(assignAccountSegmentSchema)) body: AssignAccountSegmentDto) { return this.accountsService.assignSegment(request, accountId, body); }
  @Patch(':accountId/profile')
  updateProfile(@ApiRequest() request: ApiRequestDto, @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string, @Body(new ZodValidationPipe(updateAccountProfileSchema)) body: UpdateAccountProfileDto) { return this.accountsService.updateProfile(request, accountId, body); }
}
