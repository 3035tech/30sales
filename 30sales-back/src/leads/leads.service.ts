import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { LEAD_TRANSITIONS } from './constants';
import { AssignLeadDto, CompleteTaskDto, CreateLeadDto, LeadAssigneeDto, LeadDuplicateCheckDto, LeadDuplicateCheckResponseDto, LeadPageDto, LeadRecordDto, LeadRepositoryAssignDto, LeadRepositoryCreateDto, LeadRepositoryDuplicateCheckDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, ListLeadsQueryDto, UpdateLeadStatusDto, ListTasksQueryDto, TaskPageDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto, CreateTaskDto } from './leads.dto';
import { LeadsRepository } from './leads.repository';
import { TenantAccessService } from './tenant-access.service';

@Injectable()
export class LeadsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: LeadsRepository) {}
  async listAssignees(request: ApiRequestDto): Promise<LeadAssigneeDto[]> {
    const context = await this.tenantAccess.require(request, 'assign');
    return this.repository.listAssignees(context.organizationId);
  }
  async listTasks(request: ApiRequestDto, query: ListTasksQueryDto): Promise<TaskRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.listTasks(new TaskRepositoryListDto(context.organizationId, query));
  }
  async listTasksPage(request: ApiRequestDto, query: ListTasksQueryDto): Promise<TaskPageDto> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.listTasksPage(new TaskRepositoryListDto(context.organizationId, query));
  }
  async createTask(request: ApiRequestDto, leadId: string, dto: CreateTaskDto): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const task = await this.repository.createTask(new TaskRepositoryCreateDto(context.organizationId, leadId, context.userId, dto.title, new Date(dto.dueAt), request.correlationId));
    if (!task) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return task;
  }
  async completeTask(request: ApiRequestDto, taskId: string, dto: CompleteTaskDto): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const completedAt = new Date();
    if (dto.followUp && new Date(dto.followUp.dueAt) <= completedAt) throw new BadRequestException({ code: 'FOLLOW_UP_DUE_AT_INVALID', message: 'The next task must be due in the future.' });
    const task = await this.repository.completeTask(new TaskRepositoryCompleteDto(context.organizationId, taskId, context.userId, completedAt, dto, request.correlationId));
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Open task was not found in the active organization.' });
    return task;
  }
  async list(request: ApiRequestDto, query: ListLeadsQueryDto): Promise<LeadRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return (await this.repository.list(new LeadRepositoryListDto(context.organizationId, query))).data;
  }
  async listPage(request: ApiRequestDto, query: ListLeadsQueryDto): Promise<LeadPageDto> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.list(new LeadRepositoryListDto(context.organizationId, query));
  }
  async findPossibleDuplicates(request: ApiRequestDto, dto: LeadDuplicateCheckDto): Promise<LeadDuplicateCheckResponseDto> {
    const context = await this.tenantAccess.require(request, 'create');
    return this.repository.findPossibleDuplicates(new LeadRepositoryDuplicateCheckDto(context.organizationId, dto));
  }
  async create(request: ApiRequestDto, dto: CreateLeadDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const result = await this.repository.create(new LeadRepositoryCreateDto(context.organizationId, context.userId, dto.accountName, dto.contactName, dto.email || null, dto.phone?.trim() || null, dto.source, dto.duplicateOverrideReason ?? null, request.correlationId));
    if (result instanceof LeadDuplicateCheckResponseDto) throw new ConflictException({ code: 'LEAD_POSSIBLE_DUPLICATES', message: 'Review the possible matching leads before creating this record.', candidates: result.candidates });
    return result;
  }
  async updateStatus(request: ApiRequestDto, leadId: string, dto: UpdateLeadStatusDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const current = await this.repository.findById(new LeadRepositoryFindDto(context.organizationId, leadId));
    if (!current) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    const currentStatus = current.status;
    if (!LEAD_TRANSITIONS[currentStatus].includes(dto.status)) throw new ConflictException({ code: 'INVALID_LEAD_TRANSITION', message: 'This lead cannot transition to the selected status.' });
    if (dto.status === currentStatus) throw new ConflictException({ code: 'LEAD_STATUS_UNCHANGED', message: 'Choose a different status to record a status change.' });
    const updated = await this.repository.updateStatus(new LeadRepositoryStatusChangeDto(context.organizationId, leadId, dto.status, currentStatus, dto.reason, context.userId, request.correlationId));
    if (!updated) throw new ConflictException({ code: 'LEAD_CHANGED', message: 'The lead changed in another operation. Refresh the queue and retry.' });
    return updated;
  }
  async assign(request: ApiRequestDto, leadId: string, dto: AssignLeadDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign');
    const result = await this.repository.assign(new LeadRepositoryAssignDto(context.organizationId, leadId, dto.assignedToUserId, context.userId, request.correlationId));
    if (result === 'invalid_assignee') throw new ConflictException({ code: 'ASSIGNEE_NOT_IN_ORGANIZATION', message: 'The selected user is not a member of the active organization.' });
    if (!result) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return result;
  }
}
