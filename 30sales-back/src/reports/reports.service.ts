import { Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { FunnelReportDto, FunnelReportQueryDto, FunnelReportRepositoryQueryDto } from './reports.dto';
import { ReportsRepository } from './reports.repository';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ReportsRepository) {}
  async funnel(request: ApiRequestDto, query: FunnelReportQueryDto): Promise<FunnelReportDto> {
    const context = await this.tenantAccess.require(request, 'read', 'reports');
    return this.repository.funnel(new FunnelReportRepositoryQueryDto(context.organizationId, query));
  }
}
