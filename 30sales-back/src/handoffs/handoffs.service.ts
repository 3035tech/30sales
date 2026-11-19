import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CreateHandoffDto, HandoffPageDto, HandoffRecordDto, HandoffRepositoryAcceptDto, HandoffRepositoryCreateDto, HandoffRepositoryListDto, HandoffRepositoryReturnDto, ListHandoffsQueryDto, ReturnHandoffDto } from './handoffs.dto';
import { HandoffsRepository } from './handoffs.repository';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class HandoffsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: HandoffsRepository) {}
  private canManageAll(role: string): boolean { return hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES); }
  private listInput(organizationId: string, userId: string, role: string, query: ListHandoffsQueryDto): HandoffRepositoryListDto {
    return new HandoffRepositoryListDto(organizationId, userId, this.canManageAll(role), hasOrganizationRole(role, ORGANIZATION_CLOSER_ROLES), query);
  }
  async list(request: ApiRequestDto, query: ListHandoffsQueryDto): Promise<HandoffRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.list(this.listInput(context.organizationId, context.userId, context.role, query));
  }
  async listPage(request: ApiRequestDto, query: ListHandoffsQueryDto): Promise<HandoffPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.listPage(this.listInput(context.organizationId, context.userId, context.role, query));
  }
  async create(request: ApiRequestDto, dto: CreateHandoffDto): Promise<HandoffRecordDto> {
    const context = await this.tenantAccess.require(request, 'create', 'pipeline');
    const handoff = await this.repository.create(new HandoffRepositoryCreateDto(context.organizationId, context.userId, this.canManageAll(context.role), dto, request.correlationId));
    if (!handoff) throw new ConflictException({ code: 'HANDOFF_NOT_ALLOWED', message: 'The lead must be responded and must not have another active handoff.' });
    return handoff;
  }
  async accept(request: ApiRequestDto, handoffId: string): Promise<HandoffRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!this.canManageAll(context.role) && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only closers and sales managers can accept handoffs.' });
    const handoff = await this.repository.accept(new HandoffRepositoryAcceptDto(context.organizationId, handoffId, context.userId, this.canManageAll(context.role), request.correlationId));
    if (!handoff) throw new NotFoundException({ code: 'HANDOFF_NOT_FOUND', message: 'Requested handoff was not found in the active organization.' });
    return handoff;
  }
  async returnToSdr(request: ApiRequestDto, handoffId: string, dto: ReturnHandoffDto): Promise<HandoffRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!this.canManageAll(context.role) && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only closers and sales managers can return handoffs.' });
    const handoff = await this.repository.returnToSdr(new HandoffRepositoryReturnDto(context.organizationId, handoffId, context.userId, this.canManageAll(context.role), dto, request.correlationId));
    if (!handoff) throw new NotFoundException({ code: 'HANDOFF_NOT_FOUND', message: 'Accepted handoff was not found in the active organization.' });
    return handoff;
  }
}
