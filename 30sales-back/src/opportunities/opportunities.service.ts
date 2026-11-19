import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { OPPORTUNITY_TRANSITIONS } from './opportunities.constants';
import { AssignOpportunityOwnerDto, CreatePipelineDto, CreatePipelineStageDto, ListOpportunitiesQueryDto, OpportunityAssigneeDto, OpportunityConversationContextsQueryDto, type OpportunityConversationContextDto, OpportunityHistoryRecordDto, OpportunityPageDto, OpportunityPipelineSummaryDto, OpportunityRecordDto, OpportunityRepositoryAssignOwnerDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto, PipelineRepositoryArchiveDto, PipelineRepositoryCreateDto, PipelineRepositoryUpdateDto, PipelineStageRepositoryArchiveDto, PipelineStageRepositoryCreateDto, PipelineStageRepositoryReorderDto, PipelineStageRepositoryUpdateDto, PipelineStagesDto, PipelinesDto, ReorderPipelineStagesDto, TransitionOpportunityDto, UpdatePipelineDto, UpdatePipelineStageDto } from './opportunities.dto';
import { OpportunitiesRepository } from './opportunities.repository';
import { ActivityRecordDto, ActivityRepositoryCreateDto, ActivityRepositoryListDto, CreateActivityDto } from './activities.dto';
import { OpportunityActivitiesRepository } from './activities.repository';
import { PipelineStagesRepository } from './pipeline-stages.repository';
import { PipelinesRepository } from './pipelines.repository';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
@Injectable()
export class OpportunitiesService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: OpportunitiesRepository, private readonly activitiesRepository: OpportunityActivitiesRepository, private readonly pipelineStagesRepository: PipelineStagesRepository, private readonly pipelinesRepository: PipelinesRepository) {}
  async pipelines(request: ApiRequestDto): Promise<PipelinesDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.pipelinesRepository.list(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES));
  }
  async createPipeline(request: ApiRequestDto, dto: CreatePipelineDto): Promise<PipelinesDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipelines.' });
    const result = await this.pipelinesRepository.create(new PipelineRepositoryCreateDto(context.organizationId, context.userId, dto.name, request.correlationId, dto.businessLineId));
    if (result === 'duplicate_name') throw new ConflictException({ code: 'PIPELINE_NAME_EXISTS', message: 'A pipeline with this name already exists.' });
    if (result === 'limit_reached') throw new ConflictException({ code: 'PIPELINE_LIMIT_REACHED', message: 'The organization has reached its active pipeline limit.' });
    if (result === 'business_line_not_found') throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'Business line was not found in the active organization.' });
    return result;
  }
  async updatePipeline(request: ApiRequestDto, pipelineId: string, dto: UpdatePipelineDto): Promise<PipelinesDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipelines.' });
    const result = await this.pipelinesRepository.update(new PipelineRepositoryUpdateDto(context.organizationId, context.userId, pipelineId, dto.name, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found.' });
    if (result === 'duplicate_name') throw new ConflictException({ code: 'PIPELINE_NAME_EXISTS', message: 'A pipeline with this name already exists.' });
    return result;
  }
  async setDefaultPipeline(request: ApiRequestDto, pipelineId: string): Promise<PipelinesDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipelines.' });
    const result = await this.pipelinesRepository.setDefault(context.organizationId, context.userId, pipelineId, request.correlationId);
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found.' });
    return result;
  }
  async archivePipeline(request: ApiRequestDto, pipelineId: string): Promise<PipelinesDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipelines.' });
    const result = await this.pipelinesRepository.archive(new PipelineRepositoryArchiveDto(context.organizationId, context.userId, pipelineId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found.' });
    if (result === 'default_pipeline') throw new ConflictException({ code: 'DEFAULT_PIPELINE_LOCKED', message: 'Choose a different default before archiving this pipeline.' });
    if (result === 'pipeline_in_use') throw new ConflictException({ code: 'PIPELINE_IN_USE', message: 'Move opportunities to another pipeline before archiving this pipeline.' });
    return result;
  }
  async pipelineStages(request: ApiRequestDto, pipelineId?: string): Promise<PipelineStagesDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    const canManage = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const resolvedPipelineId = pipelineId ?? await this.pipelinesRepository.ensureDefault(context.organizationId);
    if (!await this.pipelinesRepository.canAccessPipeline(context.organizationId, resolvedPipelineId, context.userId, canManage)) {
      throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found in the active business line.' });
    }
    const result = await this.pipelineStagesRepository.list(context.organizationId, resolvedPipelineId, canManage);
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found in the active organization.' });
    return result;
  }
  async createPipelineStage(request: ApiRequestDto, dto: CreatePipelineStageDto) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_STAGE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipeline stages.' });
    const pipelineId = dto.pipelineId ?? await this.pipelinesRepository.ensureDefault(context.organizationId);
    const result = await this.pipelineStagesRepository.create(new PipelineStageRepositoryCreateDto(context.organizationId, context.userId, pipelineId, dto.name, dto.afterStageKey, request.correlationId));
    if (result === 'duplicate_name') throw new ConflictException({ code: 'PIPELINE_STAGE_NAME_EXISTS', message: 'A pipeline stage with this name already exists.' });
    if (result === 'invalid_position') throw new ConflictException({ code: 'PIPELINE_STAGE_INVALID_POSITION', message: 'Choose an active open stage as the insertion point.' });
    if (result === 'limit_reached') throw new ConflictException({ code: 'PIPELINE_STAGE_LIMIT_REACHED', message: 'This pipeline has reached its custom stage limit.' });
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found.' });
    return result;
  }
  async updatePipelineStage(request: ApiRequestDto, key: string, dto: UpdatePipelineStageDto) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_STAGE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipeline stages.' });
    const pipelineId = dto.pipelineId ?? await this.pipelinesRepository.ensureDefault(context.organizationId);
    const result = await this.pipelineStagesRepository.update(new PipelineStageRepositoryUpdateDto(context.organizationId, context.userId, pipelineId, key, dto.name, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_STAGE_NOT_FOUND', message: 'Pipeline stage was not found.' });
    if (result === 'system_stage') throw new ConflictException({ code: 'PIPELINE_SYSTEM_STAGE_LOCKED', message: 'System stages cannot be renamed.' });
    if (result === 'duplicate_name') throw new ConflictException({ code: 'PIPELINE_STAGE_NAME_EXISTS', message: 'A pipeline stage with this name already exists.' });
    return result;
  }
  async reorderPipelineStages(request: ApiRequestDto, dto: ReorderPipelineStagesDto) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_STAGE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipeline stages.' });
    const pipelineId = dto.pipelineId ?? await this.pipelinesRepository.ensureDefault(context.organizationId);
    const result = await this.pipelineStagesRepository.reorder(new PipelineStageRepositoryReorderDto(context.organizationId, context.userId, pipelineId, dto.stageKeys, request.correlationId));
    if (result === 'invalid_order') throw new ConflictException({ code: 'PIPELINE_STAGE_INVALID_ORDER', message: 'The requested order must include every active stage and keep system stages in their required order.' });
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found.' });
    return result;
  }
  async archivePipelineStage(request: ApiRequestDto, key: string, requestedPipelineId?: string) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_STAGE_MANAGEMENT_FORBIDDEN', message: 'Only sales managers can manage pipeline stages.' });
    const pipelineId = requestedPipelineId ?? await this.pipelinesRepository.ensureDefault(context.organizationId);
    const result = await this.pipelineStagesRepository.archive(new PipelineStageRepositoryArchiveDto(context.organizationId, context.userId, pipelineId, key, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'PIPELINE_STAGE_NOT_FOUND', message: 'Pipeline stage was not found.' });
    if (result === 'system_stage') throw new ConflictException({ code: 'PIPELINE_SYSTEM_STAGE_LOCKED', message: 'System stages cannot be archived.' });
    if (result === 'stage_in_use') throw new ConflictException({ code: 'PIPELINE_STAGE_IN_USE', message: 'Move opportunities to another stage before archiving this stage.' });
    return result;
  }
  async listAssignees(request: ApiRequestDto): Promise<OpportunityAssigneeDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'OPPORTUNITY_ASSIGNMENT_FORBIDDEN', message: 'Only sales managers can reassign opportunities.' });
    return this.repository.listAssignees(context.organizationId);
  }
  async assignOwner(request: ApiRequestDto, opportunityId: string, dto: AssignOpportunityOwnerDto): Promise<OpportunityRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'OPPORTUNITY_ASSIGNMENT_FORBIDDEN', message: 'Only sales managers can reassign opportunities.' });
    await this.pipelinesRepository.ensureDefault(context.organizationId);
    const result = await this.repository.assignOwner(new OpportunityRepositoryAssignOwnerDto(context.organizationId, opportunityId, dto.ownerUserId, context.userId, request.correlationId));
    if (result === 'invalid_assignee') throw new ConflictException({ code: 'INVALID_OPPORTUNITY_ASSIGNEE', message: 'The selected user must be an active closer in this organization.' });
    if (result === 'terminal_opportunity') throw new ConflictException({ code: 'CLOSED_OPPORTUNITY_OWNER_LOCKED', message: 'Closed opportunities cannot be reassigned.' });
    if (!result) throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found in the active organization.' });
    return result;
  }
  async list(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.pipelinesRepository.ensureDefault(context.organizationId);
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const lineIds = canManageAll ? null : await this.pipelinesRepository.accessibleBusinessLineIds(context.organizationId, context.userId);
    if (query.businessLineId && lineIds && !lineIds.includes(query.businessLineId)) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'Business line was not found in the active organization.' });
    return this.repository.list(new OpportunityRepositoryListDto(context.organizationId, context.userId, canManageAll, hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), this.scopeOpportunityQuery(context.role, query), lineIds));
  }
  async page(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.pipelinesRepository.ensureDefault(context.organizationId);
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const lineIds = canManageAll ? null : await this.pipelinesRepository.accessibleBusinessLineIds(context.organizationId, context.userId);
    if (query.businessLineId && lineIds && !lineIds.includes(query.businessLineId)) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'Business line was not found in the active organization.' });
    return this.repository.page(new OpportunityRepositoryListDto(context.organizationId, context.userId, canManageAll, hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), this.scopeOpportunityQuery(context.role, query), lineIds));
  }
  async summary(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityPipelineSummaryDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.pipelinesRepository.ensureDefault(context.organizationId);
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const lineIds = canManageAll ? null : await this.pipelinesRepository.accessibleBusinessLineIds(context.organizationId, context.userId);
    if (query.businessLineId && lineIds && !lineIds.includes(query.businessLineId)) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'Business line was not found in the active organization.' });
    return this.repository.summary(new OpportunityRepositoryListDto(context.organizationId, context.userId, canManageAll, hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES), this.scopeOpportunityQuery(context.role, query), lineIds));
  }
  private scopeOpportunityQuery(role: string, query: ListOpportunitiesQueryDto): ListOpportunitiesQueryDto {
    return hasOrganizationRole(role, ORGANIZATION_CLOSER_ROLES) ? { ...query, view: 'mine', assignedToUserId: undefined } : query;
  }
  private requireOpportunityRecordAccess(role: string): void {
    if (!hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES) && !hasOrganizationRole(role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'OPPORTUNITY_RECORD_ACCESS_FORBIDDEN', message: 'This role cannot access individual opportunity records.' });
  }
  private async requireOpportunityLineAccess(organizationId: string, userId: string, role: string, opportunityId: string): Promise<void> {
    if (!await this.repository.canAccessOpportunity(organizationId, opportunityId, userId, hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES))) {
      throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found in the active business line.' });
    }
  }
  async transition(request: ApiRequestDto, opportunityId: string, dto: TransitionOpportunityDto): Promise<OpportunityRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES) && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only closers and sales managers can update opportunity stages.' });
    await this.requireOpportunityLineAccess(context.organizationId, context.userId, context.role, opportunityId);
    if (dto.pipelineId && dto.expectedPipelineId && dto.pipelineId !== dto.expectedPipelineId && !hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) throw new ForbiddenException({ code: 'PIPELINE_TRANSFER_FORBIDDEN', message: 'Only sales managers can move opportunities between pipelines.' });
    await this.pipelinesRepository.ensureDefault(context.organizationId);
    if (dto.pipelineId && dto.expectedPipelineId && dto.pipelineId !== dto.expectedPipelineId) {
      const targetStages = await this.pipelineStagesRepository.list(context.organizationId, dto.pipelineId, false);
      if (targetStages === 'not_found') throw new NotFoundException({ code: 'PIPELINE_NOT_FOUND', message: 'Pipeline was not found in the active organization.' });
      const targetKey = dto.stage === 'custom' ? dto.pipelineStageKey : targetStages.stages.find((stage) => stage.stage === dto.stage)?.key;
      if (!targetStages.stages.some((stage) => stage.key === targetKey && stage.isActive)) throw new ConflictException({ code: 'PIPELINE_STAGE_NOT_FOUND', message: 'Choose an active stage in the selected pipeline.' });
    }
    const sameCustomStage = dto.stage === 'custom' && dto.expectedStage === 'custom' && dto.pipelineStageKey === dto.expectedPipelineStageKey;
    const customTransition = dto.stage === 'custom' || dto.expectedStage === 'custom';
    const sameOpenStage = dto.stage === dto.expectedStage && dto.stage !== 'won' && dto.stage !== 'lost' && (dto.stage !== 'custom' || sameCustomStage);
    if (dto.expectedPipelineId !== dto.pipelineId && dto.expectedPipelineId && dto.pipelineId) {
      if (dto.stage === dto.expectedStage && !dto.reason?.trim()) throw new ConflictException({ code: 'PIPELINE_MOVE_REASON_REQUIRED', message: 'Explain why the opportunity is moving to another pipeline.' });
    } else if (!sameOpenStage && !customTransition && !OPPORTUNITY_TRANSITIONS[dto.expectedStage].includes(dto.stage)) throw new ConflictException({ code: 'INVALID_OPPORTUNITY_TRANSITION', message: 'This opportunity cannot move to the selected stage.' });
    const result = await this.repository.transition(new OpportunityRepositoryTransitionDto(context.organizationId, opportunityId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), dto, request.correlationId));
    if (result === 'different_business_line') throw new ConflictException({ code: 'OPPORTUNITY_CROSS_BUSINESS_LINE_MOVE_FORBIDDEN', message: 'An opportunity cannot be moved to a pipeline from another business line.' });
    if (!result) throw new ConflictException({ code: 'OPPORTUNITY_CHANGED', message: 'The opportunity changed or is not assigned to you. Refresh the pipeline and retry.' });
    return result;
  }
  async history(request: ApiRequestDto, opportunityId: string): Promise<OpportunityHistoryRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.requireOpportunityLineAccess(context.organizationId, context.userId, context.role, opportunityId);
    return this.repository.history(new OpportunityRepositoryHistoryDto(context.organizationId, opportunityId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)));
  }
  async conversationContexts(request: ApiRequestDto, opportunityId: string): Promise<OpportunityConversationContextDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.requireOpportunityLineAccess(context.organizationId, context.userId, context.role, opportunityId);
    const contexts = await this.repository.conversationContexts(new OpportunityConversationContextsQueryDto(context.organizationId, opportunityId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)));
    if (!contexts) throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found in the active organization.' });
    return contexts;
  }
  async activities(request: ApiRequestDto, opportunityId: string): Promise<ActivityRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    this.requireOpportunityRecordAccess(context.role);
    await this.requireOpportunityLineAccess(context.organizationId, context.userId, context.role, opportunityId);
    return this.activitiesRepository.list(new ActivityRepositoryListDto(context.organizationId, opportunityId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)));
  }
  async createActivity(request: ApiRequestDto, opportunityId: string, dto: CreateActivityDto): Promise<ActivityRecordDto> {
    const context = await this.tenantAccess.require(request, 'create', 'activities');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    if (!canManageAll && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only the opportunity owner and sales managers can add opportunity activities.' });
    await this.requireOpportunityLineAccess(context.organizationId, context.userId, context.role, opportunityId);
    const activity = await this.activitiesRepository.create(new ActivityRepositoryCreateDto(context.organizationId, opportunityId, context.userId, canManageAll, dto, request.correlationId));
    if (!activity) throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity was not found or is not assigned to you in the active organization.' });
    return activity;
  }
}
