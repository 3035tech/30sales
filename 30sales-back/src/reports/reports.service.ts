import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AiUsageReportDto, FunnelReportDto, FunnelReportQueryDto, FunnelReportRepositoryQueryDto } from './reports.dto';
import { ReportsRepository } from './reports.repository';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES, ORGANIZATION_REPORT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ReportsRepository) {}
  async funnel(request: ApiRequestDto, query: FunnelReportQueryDto): Promise<FunnelReportDto> {
    const context = await this.tenantAccess.require(request, 'read', 'reports');
    if (!hasOrganizationRole(context.role, ORGANIZATION_REPORT_ROLES)) throw new ForbiddenException({ code: 'REPORT_ACCESS_FORBIDDEN', message: 'This role cannot access organization-wide reports.' });
    const businessLineIds = await this.resolveBusinessLineIds(context.organizationId, context.userId, context.role, query.businessLineId);
    return this.repository.funnel(new FunnelReportRepositoryQueryDto(context.organizationId, query, businessLineIds));
  }
  async aiUsage(request: ApiRequestDto, query: FunnelReportQueryDto): Promise<AiUsageReportDto> {
    const context = await this.tenantAccess.require(request, 'read', 'reports');
    if (!hasOrganizationRole(context.role, ORGANIZATION_REPORT_ROLES)) throw new ForbiddenException({ code: 'REPORT_ACCESS_FORBIDDEN', message: 'This role cannot access organization-wide reports.' });
    const businessLineIds = await this.resolveBusinessLineIds(context.organizationId, context.userId, context.role, query.businessLineId);
    return this.repository.aiUsage(new FunnelReportRepositoryQueryDto(context.organizationId, query, businessLineIds));
  }

  private async resolveBusinessLineIds(organizationId: string, userId: string, role: string, selectedBusinessLineId?: string): Promise<readonly string[] | null> {
    const canManageAll = hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES);
    const accessibleIds = canManageAll ? null : await this.repository.listAccessibleBusinessLineIds(organizationId, userId);
    if (!selectedBusinessLineId) return accessibleIds;
    if (accessibleIds && !accessibleIds.includes(selectedBusinessLineId)) throw new ForbiddenException({ code: 'BUSINESS_LINE_ACCESS_FORBIDDEN', message: 'You are not assigned to the selected business line.' });
    if (!accessibleIds && !await this.repository.isActiveBusinessLine(organizationId, selectedBusinessLineId)) throw new BadRequestException({ code: 'BUSINESS_LINE_UNAVAILABLE', message: 'The selected business line is not active in the current organization.' });
    return [selectedBusinessLineId];
  }
}
