import { ConflictException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { env } from '../config/env';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssistantSettingsDto, AssistantSettingsInputDto, AssistantSettingsRepositoryDto } from './agents.dto';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AgentsRepository) {}

  async getAssistantSettings(request: ApiRequestDto): Promise<AssistantSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const settings = await this.repository.getAssistantSettings(context.organizationId);
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.transcribeAudio, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY), Boolean(env.OPENAI_API_KEY));
  }

  async saveAssistantSettings(request: ApiRequestDto, input: AssistantSettingsInputDto): Promise<AssistantSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (input.enabled && !env.ANTHROPIC_API_KEY) throw new ConflictException({ code: 'ASSISTANT_RUNTIME_NOT_CONFIGURED', message: 'The Claude API key is not configured on this server.' });
    if (input.enabled && input.transcribeAudio && !env.OPENAI_API_KEY) throw new ConflictException({ code: 'ASSISTANT_TRANSCRIPTION_NOT_CONFIGURED', message: 'The OpenAI API key is not configured on this server.' });
    const settings = await this.repository.saveAssistantSettings(new AssistantSettingsRepositoryDto(context.organizationId, context.userId, input));
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.transcribeAudio, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY), Boolean(env.OPENAI_API_KEY));
  }
}
