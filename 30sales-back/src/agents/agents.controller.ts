import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgentsService } from './agents.service';
import { assistantSettingsInputSchema, type AssistantSettingsInputDto } from './agents.dto';

@Controller('api/v1/agents/assistant')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getSettings(@ApiRequest() request: ApiRequestDto) { return this.agentsService.getAssistantSettings(request); }

  @Put()
  saveSettings(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(assistantSettingsInputSchema)) input: AssistantSettingsInputDto) { return this.agentsService.saveAssistantSettings(request, input); }
}
