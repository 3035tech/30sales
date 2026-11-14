import { Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AuditEventsPageDto, AuditRepositoryListDto, ListAuditEventsQueryDto } from './audit.dto';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AuditRepository) {}
  async list(request: ApiRequestDto, query: ListAuditEventsQueryDto): Promise<AuditEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'audit');
    return this.repository.list(new AuditRepositoryListDto(context.organizationId, query));
  }
}
