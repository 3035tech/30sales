import { Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { SofiaSettingsDto, SofiaSettingsInputDto, SofiaSettingsRepositoryDto } from './agents.dto';
import { AgentsRepository } from './agents.repository';

@Injectable()
export class AgentsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AgentsRepository) {}

  async getSofiaSettings(request: ApiRequestDto): Promise<SofiaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    return this.repository.getSofiaSettings(context.organizationId);
  }

  async saveSofiaSettings(request: ApiRequestDto, input: SofiaSettingsInputDto): Promise<SofiaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    return this.repository.saveSofiaSettings(new SofiaSettingsRepositoryDto(context.organizationId, context.userId, input));
  }
}
