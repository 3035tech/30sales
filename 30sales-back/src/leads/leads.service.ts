import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { LEAD_TRANSITIONS } from './constants';
import { AssignLeadDto, CompleteTaskDto, CreateLeadContactDto, CreateLeadDto, LeadAssigneeDto, LeadContactCreateRepositoryDto, LeadContactPrimaryRepositoryDto, LeadContactRecordDto, LeadContactRepositoryDto, LeadContactUpdateRepositoryDto, LeadDuplicateCheckDto, LeadDuplicateCheckResponseDto, LeadPageDto, LeadRecordDto, LeadRepositoryAccessDto, LeadRepositoryAssignDto, LeadRepositoryCreateDto, LeadRepositoryDuplicateCheckDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, ListLeadsQueryDto, UpdateLeadContactDto, UpdateLeadStatusDto, ListTasksQueryDto, TaskPageDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto, CreateTaskDto } from './leads.dto';
import { LeadsRepository } from './leads.repository';
import { TenantAccessService } from './tenant-access.service';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class LeadsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: LeadsRepository) {}
  private access(organizationId: string, userId: string, role: string): LeadRepositoryAccessDto {
    return new LeadRepositoryAccessDto(organizationId, userId, hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(role, ORGANIZATION_CLOSER_ROLES));
  }
  async listAssignees(request: ApiRequestDto): Promise<LeadAssigneeDto[]> {
    const context = await this.tenantAccess.require(request, 'assign');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'LEAD_ASSIGNMENT_RESTRICTED', message: 'Only organization managers can list lead assignees.' });
    return this.repository.listAssignees(context.organizationId);
  }
  async listTasks(request: ApiRequestDto, query: ListTasksQueryDto): Promise<TaskRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return this.repository.listTasks(new TaskRepositoryListDto(context.organizationId, context.userId, canManageAll, query));
  }
  async listTasksPage(request: ApiRequestDto, query: ListTasksQueryDto): Promise<TaskPageDto> {
    const context = await this.tenantAccess.require(request, 'read');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return this.repository.listTasksPage(new TaskRepositoryListDto(context.organizationId, context.userId, canManageAll, query));
  }
  async createTask(request: ApiRequestDto, leadId: string, dto: CreateTaskDto): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const task = await this.repository.createTask(new TaskRepositoryCreateDto(context.organizationId, leadId, context.userId, dto.title, new Date(dto.dueAt), this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (!task) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return task;
  }
  async completeTask(request: ApiRequestDto, taskId: string, dto: CompleteTaskDto): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const completedAt = new Date();
    if (dto.followUp && new Date(dto.followUp.dueAt) <= completedAt) throw new BadRequestException({ code: 'FOLLOW_UP_DUE_AT_INVALID', message: 'The next task must be due in the future.' });
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const task = await this.repository.completeTask(new TaskRepositoryCompleteDto(context.organizationId, taskId, context.userId, canManageAll, completedAt, dto, request.correlationId));
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Open task was not found in the active organization.' });
    return task;
  }
  async list(request: ApiRequestDto, query: ListLeadsQueryDto): Promise<LeadRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return (await this.repository.list(new LeadRepositoryListDto(context.organizationId, query, this.access(context.organizationId, context.userId, context.role)))).data;
  }
  async listPage(request: ApiRequestDto, query: ListLeadsQueryDto): Promise<LeadPageDto> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.list(new LeadRepositoryListDto(context.organizationId, query, this.access(context.organizationId, context.userId, context.role)));
  }
  async findPossibleDuplicates(request: ApiRequestDto, dto: LeadDuplicateCheckDto): Promise<LeadDuplicateCheckResponseDto> {
    const context = await this.tenantAccess.require(request, 'create');
    return this.repository.findPossibleDuplicates(new LeadRepositoryDuplicateCheckDto(context.organizationId, dto, this.access(context.organizationId, context.userId, context.role)));
  }
  async create(request: ApiRequestDto, dto: CreateLeadDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const result = await this.repository.create(new LeadRepositoryCreateDto(context.organizationId, context.userId, dto.accountName, dto.contactName?.trim() || null, dto.email || null, dto.phone?.trim() || null, dto.source, dto.duplicateOverrideReason ?? null, this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (result instanceof LeadDuplicateCheckResponseDto) throw new ConflictException({ code: 'LEAD_POSSIBLE_DUPLICATES', message: 'Review the possible matching leads before creating this record.', candidates: result.candidates });
    return result;
  }
  async listContacts(request: ApiRequestDto, leadId: string): Promise<LeadContactRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    const access = this.access(context.organizationId, context.userId, context.role);
    const contacts = await this.repository.listContacts(new LeadContactRepositoryDto(context.organizationId, leadId, context.userId, access, request.correlationId));
    if (!contacts) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return contacts;
  }
  async createContact(request: ApiRequestDto, leadId: string, dto: CreateLeadContactDto): Promise<LeadContactRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const contact = await this.repository.createContact(new LeadContactCreateRepositoryDto(context.organizationId, leadId, context.userId, dto, this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (contact === 'lead_not_found') throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    if (contact === 'duplicate_contact') throw new ConflictException({ code: 'LEAD_CONTACT_ALREADY_EXISTS', message: 'A contact with this e-mail or phone is already linked to this lead.' });
    return contact;
  }
  async updateContact(request: ApiRequestDto, leadId: string, contactId: string, dto: UpdateLeadContactDto): Promise<LeadContactRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const contact = await this.repository.updateContact(new LeadContactUpdateRepositoryDto(context.organizationId, leadId, contactId, context.userId, dto, this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (!contact) throw new NotFoundException({ code: 'LEAD_CONTACT_NOT_FOUND', message: 'Contact was not found for this lead in the active organization.' });
    return contact;
  }
  async setPrimaryContact(request: ApiRequestDto, leadId: string, contactId: string): Promise<LeadContactRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const contact = await this.repository.setPrimaryContact(new LeadContactPrimaryRepositoryDto(context.organizationId, leadId, contactId, context.userId, this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (!contact) throw new NotFoundException({ code: 'LEAD_CONTACT_NOT_FOUND', message: 'Contact was not found for this lead in the active organization.' });
    return contact;
  }
  async updateStatus(request: ApiRequestDto, leadId: string, dto: UpdateLeadStatusDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const access = this.access(context.organizationId, context.userId, context.role);
    const current = await this.repository.findById(new LeadRepositoryFindDto(context.organizationId, leadId, access));
    if (!current) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    const currentStatus = current.status;
    if (!LEAD_TRANSITIONS[currentStatus].includes(dto.status)) throw new ConflictException({ code: 'INVALID_LEAD_TRANSITION', message: 'This lead cannot transition to the selected status.' });
    if (dto.status === currentStatus) throw new ConflictException({ code: 'LEAD_STATUS_UNCHANGED', message: 'Choose a different status to record a status change.' });
    const updated = await this.repository.updateStatus(new LeadRepositoryStatusChangeDto(context.organizationId, leadId, dto.status, currentStatus, dto.reason, context.userId, access, request.correlationId));
    if (!updated) throw new ConflictException({ code: 'LEAD_CHANGED', message: 'The lead changed in another operation. Refresh the queue and retry.' });
    return updated;
  }
  async assign(request: ApiRequestDto, leadId: string, dto: AssignLeadDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'LEAD_ASSIGNMENT_RESTRICTED', message: 'Only organization managers can assign leads.' });
    const result = await this.repository.assign(new LeadRepositoryAssignDto(context.organizationId, leadId, dto.assignedToUserId, context.userId, this.access(context.organizationId, context.userId, context.role), request.correlationId));
    if (result === 'invalid_assignee') throw new ConflictException({ code: 'ASSIGNEE_NOT_IN_ORGANIZATION', message: 'The selected user is not a member of the active organization.' });
    if (!result) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return result;
  }
}
