import { ForbiddenException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CheckExternalIdentitiesInputDto, ExternalIdentityCheckDto, ImportLeadsInputDto, ImportLeadsResultDto, ImportRepositoryIdentityCheckDto, ImportRepositoryLeadsDto, ImportRepositoryPreviewDto, ImportsPreviewDto, PreviewImportsInputDto } from './imports.dto';
import { ImportsRepository } from './imports.repository';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class ImportsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ImportsRepository) {}
  async checkExternalIdentities(request: ApiRequestDto, input: CheckExternalIdentitiesInputDto): Promise<ExternalIdentityCheckDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const identities = await this.repository.checkExternalIdentities(new ImportRepositoryIdentityCheckDto(context.organizationId, input));
    return new ExternalIdentityCheckDto(input.provider, identities);
  }
  async preview(request: ApiRequestDto, input: PreviewImportsInputDto): Promise<ImportsPreviewDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.preview(new ImportRepositoryPreviewDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), input));
    if (result === 'business_line_unavailable') throw new ForbiddenException({ code: 'BUSINESS_LINE_UNAVAILABLE', message: 'The selected business line is unavailable.' });
    return result;
  }
  async importLeads(request: ApiRequestDto, input: ImportLeadsInputDto): Promise<ImportLeadsResultDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.importLeads(new ImportRepositoryLeadsDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), request.correlationId, input));
    if (result === 'business_line_unavailable') throw new ForbiddenException({ code: 'BUSINESS_LINE_UNAVAILABLE', message: 'The selected business line is unavailable.' });
    return result;
  }
}
