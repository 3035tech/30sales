import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CloserEventAcknowledgeDto, CloserEventsListDto, CloserEventsPageDto, ListCloserEventsQueryDto } from './closer-events.dto';
import { CloserEventsRepository } from './closer-events.repository';

@Injectable()
export class CloserEventsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: CloserEventsRepository) {}
  async list(request: ApiRequestDto, query: ListCloserEventsQueryDto): Promise<CloserEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.list(new CloserEventsListDto(context.organizationId, context.userId, query));
  }
  async acknowledge(request: ApiRequestDto, eventId: string) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    const result = await this.repository.acknowledge(new CloserEventAcknowledgeDto(context.organizationId, eventId, context.userId, request.correlationId));
    if (!result) throw new NotFoundException({ code: 'CLOSER_EVENT_NOT_FOUND', message: 'An active event assigned to the current user was not found.' });
    return result;
  }
}
