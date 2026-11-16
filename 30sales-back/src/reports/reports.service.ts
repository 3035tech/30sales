import { ForbiddenException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AiUsageReportDto, FunnelReportDto, FunnelReportQueryDto, FunnelReportRepositoryQueryDto } from './reports.dto';
import { ReportsRepository } from './reports.repository';
import { hasOrganizationRole, ORGANIZATION_REPORT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ReportsRepository) {}
  async funnel(request: ApiRequestDto, query: FunnelReportQueryDto): Promise<FunnelReportDto> {
    const context = await this.tenantAccess.require(request, 'read', 'reports');
    if (!hasOrganizationRole(context.role, ORGANIZATION_REPORT_ROLES)) throw new ForbiddenException({ code: 'REPORT_ACCESS_FORBIDDEN', message: 'This role cannot access organization-wide reports.' });
    return this.repository.funnel(new FunnelReportRepositoryQueryDto(context.organizationId, query));
  }
  async aiUsage(request: ApiRequestDto, query: FunnelReportQueryDto): Promise<AiUsageReportDto> {
    const context = await this.tenantAccess.require(request, 'read', 'reports');
    if (!hasOrganizationRole(context.role, ORGANIZATION_REPORT_ROLES)) throw new ForbiddenException({ code: 'REPORT_ACCESS_FORBIDDEN', message: 'This role cannot access organization-wide reports.' });
    return this.repository.aiUsage(new FunnelReportRepositoryQueryDto(context.organizationId, query));
  }
}
