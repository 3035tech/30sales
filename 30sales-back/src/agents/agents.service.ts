import { ConflictException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { env } from '../config/env';
import { TenantAccessService } from '../leads/tenant-access.service';
import { SofiaSettingsDto, SofiaSettingsInputDto, SofiaSettingsRepositoryDto } from './agents.dto';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AgentsRepository) {}

  async getSofiaSettings(request: ApiRequestDto): Promise<SofiaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const settings = await this.repository.getSofiaSettings(context.organizationId);
    return new SofiaSettingsDto(settings.enabled, settings.model, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY));
  }

  async saveSofiaSettings(request: ApiRequestDto, input: SofiaSettingsInputDto): Promise<SofiaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (input.enabled && !env.ANTHROPIC_API_KEY) throw new ConflictException({ code: 'SOFIA_RUNTIME_NOT_CONFIGURED', message: 'The Claude API key is not configured on this server.' });
    const settings = await this.repository.saveSofiaSettings(new SofiaSettingsRepositoryDto(context.organizationId, context.userId, input));
    return new SofiaSettingsDto(settings.enabled, settings.model, settings.systemPrompt, settings.updatedAt, Boolean(env.ANTHROPIC_API_KEY));
  }
}
