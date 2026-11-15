import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { OPPORTUNITY_TRANSITIONS } from './opportunities.constants';
import { AssignOpportunityOwnerDto, ListOpportunitiesQueryDto, OpportunityAssigneeDto, OpportunityHistoryRecordDto, OpportunityPageDto, OpportunityRecordDto, OpportunityRepositoryAssignOwnerDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto, TransitionOpportunityDto } from './opportunities.dto';
import { OpportunitiesRepository } from './opportunities.repository';
import { ActivityRecordDto, ActivityRepositoryCreateDto, ActivityRepositoryListDto, CreateActivityDto } from './activities.dto';
import { OpportunityActivitiesRepository } from './activities.repository';
import { NotFoundException } from '@nestjs/common';

const MANAGER_ROLES = ['owner', 'admin', 'manager'];
@Injectable()
export class OpportunitiesService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: OpportunitiesRepository, private readonly activitiesRepository: OpportunityActivitiesRepository) {}
  async listAssignees(request: ApiRequestDto): Promise<OpportunityAssigneeDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    if (!MANAGER_ROLES.includes(context.role)) throw new ForbiddenException({ code: 'OPPORTUNITY_ASSIGNMENT_FORBIDDEN', message: 'Only sales managers can reassign opportunities.' });
    return this.repository.listAssignees(context.organizationId);
  }
  async assignOwner(request: ApiRequestDto, opportunityId: string, dto: AssignOpportunityOwnerDto): Promise<OpportunityRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!MANAGER_ROLES.includes(context.role)) throw new ForbiddenException({ code: 'OPPORTUNITY_ASSIGNMENT_FORBIDDEN', message: 'Only sales managers can reassign opportunities.' });
    const result = await this.repository.assignOwner(new OpportunityRepositoryAssignOwnerDto(context.organizationId, opportunityId, dto.ownerUserId, context.userId, request.correlationId));
    if (result === 'invalid_assignee') throw new ConflictException({ code: 'INVALID_OPPORTUNITY_ASSIGNEE', message: 'The selected user must be an active closer in this organization.' });
    if (result === 'terminal_opportunity') throw new ConflictException({ code: 'CLOSED_OPPORTUNITY_OWNER_LOCKED', message: 'Closed opportunities cannot be reassigned.' });
    if (!result) throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found in the active organization.' });
    return result;
  }
  async list(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.list(new OpportunityRepositoryListDto(context.organizationId, context.userId, MANAGER_ROLES.includes(context.role), context.role === 'closer', query));
  }
  async page(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.page(new OpportunityRepositoryListDto(context.organizationId, context.userId, MANAGER_ROLES.includes(context.role), context.role === 'closer', query));
  }
  async transition(request: ApiRequestDto, opportunityId: string, dto: TransitionOpportunityDto): Promise<OpportunityRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!MANAGER_ROLES.includes(context.role) && context.role !== 'closer') throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only closers and sales managers can update opportunity stages.' });
    const sameOpenStage = dto.stage === dto.expectedStage && dto.stage !== 'won' && dto.stage !== 'lost';
    if (!sameOpenStage && !OPPORTUNITY_TRANSITIONS[dto.expectedStage].includes(dto.stage)) throw new ConflictException({ code: 'INVALID_OPPORTUNITY_TRANSITION', message: 'This opportunity cannot move to the selected stage.' });
    const result = await this.repository.transition(new OpportunityRepositoryTransitionDto(context.organizationId, opportunityId, context.userId, MANAGER_ROLES.includes(context.role), dto, request.correlationId));
    if (!result) throw new ConflictException({ code: 'OPPORTUNITY_CHANGED', message: 'The opportunity changed or is not assigned to you. Refresh the pipeline and retry.' });
    return result;
  }
  async history(request: ApiRequestDto, opportunityId: string): Promise<OpportunityHistoryRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.history(new OpportunityRepositoryHistoryDto(context.organizationId, opportunityId));
  }
  async activities(request: ApiRequestDto, opportunityId: string): Promise<ActivityRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.activitiesRepository.list(new ActivityRepositoryListDto(context.organizationId, opportunityId));
  }
  async createActivity(request: ApiRequestDto, opportunityId: string, dto: CreateActivityDto): Promise<ActivityRecordDto> {
    const context = await this.tenantAccess.require(request, 'create', 'activities');
    const canManageAll = MANAGER_ROLES.includes(context.role);
    if (!canManageAll && context.role !== 'closer') throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only the opportunity owner and sales managers can add opportunity activities.' });
    const activity = await this.activitiesRepository.create(new ActivityRepositoryCreateDto(context.organizationId, opportunityId, context.userId, canManageAll, dto, request.correlationId));
    if (!activity) throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found or is not assigned to you in the active organization.' });
    return activity;
  }
}
