import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { env } from '../config/env';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssistantProfileDto, AssistantProfileRepositoryDto, AssistantSettingsDto, AssistantSettingsInputDto, AssistantSettingsRepositoryDto, type AssistantProfileInputDto } from './agents.dto';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AgentsRepository) {}

  async listAssistantProfiles(request: ApiRequestDto, businessLineId?: string): Promise<AssistantProfileDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can access assistant profiles.' });
    if (!businessLineId) throw new BadRequestException({ code: 'BUSINESS_LINE_REQUIRED', message: 'Choose a business line to list assistant profiles.' });
    const profiles = await this.repository.listAssistantProfiles(context.organizationId, businessLineId);
    if (!profiles) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    return profiles;
  }

  async saveAssistantProfile(request: ApiRequestDto, input: AssistantProfileInputDto, profileId: string | null = null): Promise<AssistantProfileDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can configure assistant profiles.' });
    if (input.enabled && !env.ANTHROPIC_API_KEY) throw new ConflictException({ code: 'ASSISTANT_RUNTIME_NOT_CONFIGURED', message: 'The Claude API key is not configured on this server.' });
    if (input.enabled && input.transcribeAudio && !env.OPENAI_API_KEY) throw new ConflictException({ code: 'ASSISTANT_TRANSCRIPTION_NOT_CONFIGURED', message: 'The OpenAI API key is not configured on this server.' });
    const profile = await this.repository.saveAssistantProfile(new AssistantProfileRepositoryDto(context.organizationId, context.userId, input, profileId, request.correlationId));
    if (!profile) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The active business line was not found in this organization.' });
    if (profile === 'not_found') throw new NotFoundException({ code: 'ASSISTANT_PROFILE_NOT_FOUND', message: 'The assistant profile was not found in this business line.' });
    return profile;
  }

  async deleteAssistantProfile(request: ApiRequestDto, profileId: string): Promise<{ deleted: true }> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'BUSINESS_LINE_MANAGEMENT_REQUIRED', message: 'Only organization managers can configure assistant profiles.' });
    const deleted = await this.repository.deleteAssistantProfile(context.organizationId, profileId, context.userId, request.correlationId);
    if (deleted === 'assigned') throw new ConflictException({ code: 'ASSISTANT_PROFILE_IN_USE', message: 'Remove this profile from every channel before deleting it.' });
    if (!deleted) throw new NotFoundException({ code: 'ASSISTANT_PROFILE_NOT_FOUND', message: 'The assistant profile was not found in this organization.' });
    return { deleted: true };
  }

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
