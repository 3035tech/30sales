import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ACCOUNT_SEGMENT_ERROR_CODE, ACCOUNT_SEGMENT_RESULT, AccountPageDto, AccountProfileRepositoryUpdateDto, AccountSegmentRepositoryAssignDto, AccountSegmentRepositoryCreateDto, AccountsRepositoryListDto, AssignAccountSegmentDto, CreateAccountSegmentDto, ListAccountsQueryDto, UpdateAccountProfileDto } from './accounts.dto';
import { AccountsRepository } from './accounts.repository';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { ACCOUNT_PROFILE_ERROR_CODE } from './accounts.constants';

@Injectable()
export class AccountsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AccountsRepository) {}
  async list(request: ApiRequestDto, query: ListAccountsQueryDto): Promise<AccountPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'leads');
    return this.repository.list(new AccountsRepositoryListDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), query));
  }
  async listSegments(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'leads');
    return this.repository.listSegments(context.organizationId);
  }
  async createSegment(request: ApiRequestDto, body: CreateAccountSegmentDto) {
    const context = await this.tenantAccess.require(request, 'create');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: ACCOUNT_SEGMENT_ERROR_CODE.restricted, message: 'Only organization managers can maintain account segments.' });
    const result = await this.repository.createSegment(new AccountSegmentRepositoryCreateDto(context.organizationId, context.userId, body.name, request.correlationId));
    if (result === ACCOUNT_SEGMENT_RESULT.exists) throw new ConflictException({ code: ACCOUNT_SEGMENT_ERROR_CODE.exists, message: 'An account segment with this name already exists.' });
    return result;
  }
  async assignSegment(request: ApiRequestDto, accountId: string, body: AssignAccountSegmentDto) {
    const context = await this.tenantAccess.require(request, 'update');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: ACCOUNT_SEGMENT_ERROR_CODE.restricted, message: 'Only organization managers can classify accounts.' });
    const result = await this.repository.assignSegment(new AccountSegmentRepositoryAssignDto(context.organizationId, accountId, body.segmentId, context.userId, request.correlationId));
    if (result === ACCOUNT_SEGMENT_RESULT.accountNotFound) throw new NotFoundException({ code: ACCOUNT_SEGMENT_ERROR_CODE.accountNotFound, message: 'Account was not found in the active organization.' });
    if (result === ACCOUNT_SEGMENT_RESULT.segmentNotFound) throw new NotFoundException({ code: ACCOUNT_SEGMENT_ERROR_CODE.notFound, message: 'Account segment was not found in the active organization.' });
    return result;
  }
  async updateProfile(request: ApiRequestDto, accountId: string, body: UpdateAccountProfileDto) {
    const context = await this.tenantAccess.require(request, 'update', 'leads');
    const result = await this.repository.updateProfile(new AccountProfileRepositoryUpdateDto(context.organizationId, accountId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), body.marketSegment, body.studentCount, request.correlationId));
    if (result === ACCOUNT_PROFILE_ERROR_CODE.notFound) throw new NotFoundException({ code: result, message: 'Account was not found in the active organization.' });
    return result;
  }
}
