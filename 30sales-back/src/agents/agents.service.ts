import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { env } from '../config/env';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssistantSettingsDto, AssistantSettingsInputDto, AssistantSettingsRepositoryDto } from './agents.dto';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AgentsRepository) {}

  async getAssistantSettings(request: ApiRequestDto, businessLineId?: string): Promise<AssistantSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (businessLineId && !hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can configure an assistant for a business line.' });
    const settings = await this.repository.getAssistantSettings(context.organizationId, businessLineId ?? null);
    if (!settings) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.transcribeAudio, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY), Boolean(env.OPENAI_API_KEY), settings.businessLineId, settings.businessLineName, settings.inherited);
  }

  async saveAssistantSettings(request: ApiRequestDto, input: AssistantSettingsInputDto): Promise<AssistantSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const businessLineId = input.businessLineId ?? null;
    if (businessLineId && !hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can configure an assistant for a business line.' });
    if (input.enabled && !env.ANTHROPIC_API_KEY) throw new ConflictException({ code: 'ASSISTANT_RUNTIME_NOT_CONFIGURED', message: 'The Claude API key is not configured on this server.' });
    if (input.enabled && input.transcribeAudio && !env.OPENAI_API_KEY) throw new ConflictException({ code: 'ASSISTANT_TRANSCRIPTION_NOT_CONFIGURED', message: 'The OpenAI API key is not configured on this server.' });
    const settings = await this.repository.saveAssistantSettings(new AssistantSettingsRepositoryDto(context.organizationId, context.userId, input, businessLineId, request.correlationId));
    if (!settings) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.transcribeAudio, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY), Boolean(env.OPENAI_API_KEY), settings.businessLineId, settings.businessLineName, settings.inherited);
  }

  async resetBusinessLineAssistantSettings(request: ApiRequestDto, businessLineId?: string): Promise<AssistantSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (!businessLineId) throw new BadRequestException({ code: 'BUSINESS_LINE_REQUIRED', message: 'Choose a business line to reset its assistant configuration.' });
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can configure an assistant for a business line.' });
    if (!await this.repository.resetBusinessLineAssistantSettings(context.organizationId, businessLineId, context.userId, request.correlationId)) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    const settings = await this.repository.getAssistantSettings(context.organizationId, businessLineId);
    if (!settings) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.transcribeAudio, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY), Boolean(env.OPENAI_API_KEY), settings.businessLineId, settings.businessLineName, settings.inherited);
  }
}
