import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ACCOUNT_CONTACT_ERROR_CODE, ACCOUNT_CONTACT_RESULT, ACCOUNT_PROFILE_ERROR_CODE, ACCOUNT_SEGMENT_ERROR_CODE, ACCOUNT_SEGMENT_RESULT } from './accounts.constants';
import { AccountContactMutationRepositoryDto, AccountContactsRepositoryDto, AccountContactPageDto, AccountPageDto, AccountProfileRepositoryUpdateDto, AccountSegmentRepositoryAssignDto, AccountSegmentRepositoryCreateDto, AccountsRepositoryListDto, AssignAccountSegmentDto, CreateAccountSegmentDto, ListAccountContactsQueryDto, ListAccountsQueryDto, UpdateAccountProfileDto } from './accounts.dto';
import { AccountsRepository } from './accounts.repository';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class AccountsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AccountsRepository) {}
  async list(request: ApiRequestDto, query: ListAccountsQueryDto): Promise<AccountPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'leads');
    return this.repository.list(new AccountsRepositoryListDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), query));
  }
  async listContacts(request: ApiRequestDto, accountId: string, query: ListAccountContactsQueryDto): Promise<AccountContactPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'leads');
    const result = await this.repository.listContacts(new AccountContactsRepositoryDto(context.organizationId, accountId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), query));
    if (!result) throw new NotFoundException({ code: ACCOUNT_CONTACT_ERROR_CODE.accountNotFound, message: 'Account was not found in the active organization.' });
    return result;
  }
  async unlinkContact(request: ApiRequestDto, accountId: string, personId: string, query: ListAccountContactsQueryDto) {
    const context = await this.tenantAccess.require(request, 'update', 'leads');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: ACCOUNT_CONTACT_ERROR_CODE.restricted, message: 'Only organization managers can unlink account contacts.' });
    const result = await this.repository.unlinkContact(new AccountContactMutationRepositoryDto(context.organizationId, accountId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), query, personId, request.correlationId));
    if (result === ACCOUNT_CONTACT_RESULT.accountNotFound) throw new NotFoundException({ code: ACCOUNT_CONTACT_ERROR_CODE.accountNotFound, message: 'Account was not found in the active organization.' });
    if (result === ACCOUNT_CONTACT_RESULT.personNotFound) throw new NotFoundException({ code: ACCOUNT_CONTACT_ERROR_CODE.personNotFound, message: 'Contact was not found for this account in the active organization.' });
    if (result === ACCOUNT_CONTACT_RESULT.alreadyRevoked) throw new ConflictException({ code: ACCOUNT_CONTACT_ERROR_CODE.alreadyRevoked, message: 'Contact is already unlinked from this account.' });
    return result;
  }
  async restoreContact(request: ApiRequestDto, accountId: string, personId: string, query: ListAccountContactsQueryDto) {
    const context = await this.tenantAccess.require(request, 'update', 'leads');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: ACCOUNT_CONTACT_ERROR_CODE.restricted, message: 'Only organization managers can restore account contacts.' });
    const result = await this.repository.restoreContact(new AccountContactMutationRepositoryDto(context.organizationId, accountId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), query, personId, request.correlationId));
    if (result === ACCOUNT_CONTACT_RESULT.accountNotFound) throw new NotFoundException({ code: ACCOUNT_CONTACT_ERROR_CODE.accountNotFound, message: 'Account was not found in the active organization.' });
    if (result === ACCOUNT_CONTACT_RESULT.personNotFound) throw new NotFoundException({ code: ACCOUNT_CONTACT_ERROR_CODE.personNotFound, message: 'Contact was not found for this account in the active organization.' });
    if (result === ACCOUNT_CONTACT_RESULT.alreadyActive) throw new ConflictException({ code: ACCOUNT_CONTACT_ERROR_CODE.alreadyActive, message: 'Contact is already linked to this account.' });
    return result;
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
