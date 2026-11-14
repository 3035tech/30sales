import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { OPPORTUNITY_TRANSITIONS } from './opportunities.constants';
import { ListOpportunitiesQueryDto, OpportunityHistoryRecordDto, OpportunityRecordDto, OpportunityRepositoryHistoryDto, OpportunityRepositoryListDto, OpportunityRepositoryTransitionDto, TransitionOpportunityDto } from './opportunities.dto';
import { OpportunitiesRepository } from './opportunities.repository';

const MANAGER_ROLES = ['owner', 'admin', 'manager'];
@Injectable()
export class OpportunitiesService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: OpportunitiesRepository) {}
  async list(request: ApiRequestDto, query: ListOpportunitiesQueryDto): Promise<OpportunityRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.list(new OpportunityRepositoryListDto(context.organizationId, context.userId, MANAGER_ROLES.includes(context.role), context.role === 'closer', query));
  }
  async transition(request: ApiRequestDto, opportunityId: string, dto: TransitionOpportunityDto): Promise<OpportunityRecordDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!MANAGER_ROLES.includes(context.role) && context.role !== 'closer') throw new ForbiddenException({ code: 'CLOSER_ROLE_REQUIRED', message: 'Only closers and sales managers can update opportunity stages.' });
    const sameOpenStage = dto.stage === dto.expectedStage && dto.stage !== 'won' && dto.stage !== 'lost';
    if (!sameOpenStage && !OPPORTUNITY_TRANSITIONS[dto.expectedStage].includes(dto.stage)) throw new ConflictException({ code: 'INVALID_OPPORTUNITY_TRANSITION', message: 'This opportunity cannot move to the selected stage.' });
    const result = await this.repository.transition(new OpportunityRepositoryTransitionDto(context.organizationId, opportunityId, context.userId, MANAGER_ROLES.includes(context.role), dto));
    if (!result) throw new ConflictException({ code: 'OPPORTUNITY_CHANGED', message: 'The opportunity changed or is not assigned to you. Refresh the pipeline and retry.' });
    return result;
  }
  async history(request: ApiRequestDto, opportunityId: string): Promise<OpportunityHistoryRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.history(new OpportunityRepositoryHistoryDto(context.organizationId, opportunityId));
  }
}
