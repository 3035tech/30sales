import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgentsService } from './agents.service';
import { assistantBusinessLineIdSchema, assistantProfileInputSchema, assistantSettingsInputSchema, type AssistantProfileInputDto, type AssistantSettingsInputDto } from './agents.dto';

@Controller('api/v1/agents/assistant')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getSettings(@ApiRequest() request: ApiRequestDto, @Query('businessLineId', new ZodValidationPipe(assistantBusinessLineIdSchema)) businessLineId?: string) { return this.agentsService.getAssistantSettings(request, businessLineId); }

  @Put()
  saveSettings(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(assistantSettingsInputSchema)) input: AssistantSettingsInputDto) { return this.agentsService.saveAssistantSettings(request, input); }

  @Delete()
  resetLineSettings(@ApiRequest() request: ApiRequestDto, @Query('businessLineId', new ZodValidationPipe(assistantBusinessLineIdSchema)) businessLineId?: string) { return this.agentsService.resetBusinessLineAssistantSettings(request, businessLineId); }

  @Post('conversations/:id/reply-draft')
  draftConversationReply(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) conversationId: string) { return this.agentsService.draftConversationReply(request, conversationId); }
}

const profileIdSchema = z.string().uuid();

@Controller('api/v1/agents/profiles')
export class AssistantProfilesController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query('businessLineId', new ZodValidationPipe(assistantBusinessLineIdSchema)) businessLineId?: string) { return this.agentsService.listAssistantProfiles(request, businessLineId); }

  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(assistantProfileInputSchema)) input: AssistantProfileInputDto) { return this.agentsService.saveAssistantProfile(request, input); }

  @Patch(':id')
  update(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(profileIdSchema)) profileId: string, @Body(new ZodValidationPipe(assistantProfileInputSchema)) input: AssistantProfileInputDto) { return this.agentsService.saveAssistantProfile(request, input, profileId); }

  @Delete(':id')
  delete(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(profileIdSchema)) profileId: string) { return this.agentsService.deleteAssistantProfile(request, profileId); }
}
