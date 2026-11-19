import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { BusinessLineCreateCommandDto, BusinessLineListDto, BusinessLineMembersCommandDto, BusinessLineMembersDto, BusinessLineRecordDto, BusinessLineUpdateCommandDto, type CreateBusinessLineDto, type SetBusinessLineMembersDto, type UpdateBusinessLineDto } from './business-lines.dto';
import { BUSINESS_LINE_ERROR } from './business-lines.constants';
import { BusinessLinesRepository } from './business-lines.repository';

@Injectable()
export class BusinessLinesService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: BusinessLinesRepository) {}

  async list(request: ApiRequestDto): Promise<BusinessLineListDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    const canManage = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return this.repository.list(context.organizationId, context.userId, canManage);
  }

  async create(request: ApiRequestDto, input: CreateBusinessLineDto): Promise<BusinessLineRecordDto> {
    const context = await this.requireManager(request);
    const result = await this.repository.create(new BusinessLineCreateCommandDto(context.organizationId, context.userId, input, request.correlationId));
    if (result === 'creator_not_member') throw new ForbiddenException({ code: BUSINESS_LINE_ERROR.creatorMembershipMissing, message: 'The business line creator must be an active member of the organization.' });
    if (result === 'duplicate_slug') throw new ConflictException({ code: BUSINESS_LINE_ERROR.duplicateSlug, message: 'A business line with this identifier already exists.' });
    return result;
  }

  async update(request: ApiRequestDto, businessLineId: string, input: UpdateBusinessLineDto): Promise<BusinessLineRecordDto> {
    const context = await this.requireManager(request);
    const result = await this.repository.update(new BusinessLineUpdateCommandDto(context.organizationId, context.userId, businessLineId, input, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: BUSINESS_LINE_ERROR.notFound, message: 'Business line was not found.' });
    if (result === 'duplicate_slug') throw new ConflictException({ code: BUSINESS_LINE_ERROR.duplicateSlug, message: 'A business line with this identifier already exists.' });
    if (result === 'archived') throw new ConflictException({ code: 'BUSINESS_LINE_ARCHIVED', message: 'Archived business lines cannot be changed.' });
    if (result === 'last_active_line') throw new ConflictException({ code: 'BUSINESS_LINE_LAST_ACTIVE', message: 'At least one active business line must remain.' });
    if (result === 'invalid_transition') throw new UnprocessableEntityException({ code: 'BUSINESS_LINE_INVALID_TRANSITION', message: 'The requested business line status transition is not allowed.' });
    return result;
  }

  async listMembers(request: ApiRequestDto, businessLineId: string): Promise<BusinessLineMembersDto> {
    const context = await this.requireManager(request);
    const result = await this.repository.listMembers(context.organizationId, businessLineId);
    if (!result) throw new NotFoundException({ code: BUSINESS_LINE_ERROR.notFound, message: 'Business line was not found.' });
    return result;
  }

  async setMembers(request: ApiRequestDto, businessLineId: string, input: SetBusinessLineMembersDto): Promise<BusinessLineMembersDto> {
    const context = await this.requireManager(request);
    const result = await this.repository.setMembers(new BusinessLineMembersCommandDto(context.organizationId, context.userId, businessLineId, input.memberUserIds, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: BUSINESS_LINE_ERROR.notFound, message: 'Business line was not found.' });
    if (result === 'archived') throw new ConflictException({ code: 'BUSINESS_LINE_ARCHIVED', message: 'Archived business lines cannot change team membership.' });
    if (result === 'invalid_members') throw new UnprocessableEntityException({ code: BUSINESS_LINE_ERROR.invalidMembers, message: 'Every selected user must be a member of the active organization.' });
    return result;
  }

  private async requireManager(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'update', 'leads');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: BUSINESS_LINE_ERROR.managementForbidden, message: 'Only organization managers can manage business lines.' });
    return context;
  }
}
