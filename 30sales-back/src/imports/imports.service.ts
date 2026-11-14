import { Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CheckExternalIdentitiesInputDto, ExternalIdentityCheckDto, ImportRepositoryIdentityCheckDto } from './imports.dto';
import { ImportsRepository } from './imports.repository';

@Injectable()
export class ImportsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ImportsRepository) {}
  async checkExternalIdentities(request: ApiRequestDto, input: CheckExternalIdentitiesInputDto): Promise<ExternalIdentityCheckDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const identities = await this.repository.checkExternalIdentities(new ImportRepositoryIdentityCheckDto(context.organizationId, input));
    return new ExternalIdentityCheckDto(input.provider, identities);
  }
}
