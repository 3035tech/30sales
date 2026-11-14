import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { LEAD_TRANSITIONS } from './constants';
import { CreateLeadDto, LeadRecordDto, LeadRepositoryCreateDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, ListLeadsQueryDto, UpdateLeadStatusDto, ListTasksQueryDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto, CreateTaskDto } from './leads.dto';
import { LeadsRepository } from './leads.repository';
import { TenantAccessService } from './tenant-access.service';

@Injectable()
export class LeadsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: LeadsRepository) {}
  async listTasks(request: ApiRequestDto, query: ListTasksQueryDto): Promise<TaskRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.listTasks(new TaskRepositoryListDto(context.organizationId, query));
  }
  async createTask(request: ApiRequestDto, leadId: string, dto: CreateTaskDto): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const task = await this.repository.createTask(new TaskRepositoryCreateDto(context.organizationId, leadId, context.userId, dto.title, new Date(dto.dueAt)));
    if (!task) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    return task;
  }
  async completeTask(request: ApiRequestDto, taskId: string): Promise<TaskRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const task = await this.repository.completeTask(new TaskRepositoryCompleteDto(context.organizationId, taskId, new Date()));
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Open task was not found in the active organization.' });
    return task;
  }
  async list(request: ApiRequestDto, query: ListLeadsQueryDto): Promise<LeadRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.list(new LeadRepositoryListDto(context.organizationId, query));
  }
  async create(request: ApiRequestDto, dto: CreateLeadDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'create');
    return this.repository.create(new LeadRepositoryCreateDto(context.organizationId, context.userId, dto.accountName, dto.contactName, dto.email || null, dto.phone?.trim() || null, dto.source));
  }
  async updateStatus(request: ApiRequestDto, leadId: string, dto: UpdateLeadStatusDto): Promise<LeadRecordDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const current = await this.repository.findById(new LeadRepositoryFindDto(context.organizationId, leadId));
    if (!current) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead was not found in the active organization.' });
    const currentStatus = current.status;
    if (!LEAD_TRANSITIONS[currentStatus].includes(dto.status)) throw new ConflictException({ code: 'INVALID_LEAD_TRANSITION', message: 'This lead cannot transition to the selected status.' });
    const updated = await this.repository.updateStatus(new LeadRepositoryStatusChangeDto(context.organizationId, leadId, dto.status, currentStatus, context.userId));
    if (!updated) throw new ConflictException({ code: 'LEAD_CHANGED', message: 'The lead changed in another operation. Refresh the queue and retry.' });
    return updated;
  }
}
