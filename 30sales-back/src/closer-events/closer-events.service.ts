import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CloserEventActionInputDto, CloserEventMutationDto, CloserEventsListDto, CloserEventsPageDto, ListCloserEventsQueryDto } from './closer-events.dto';
import { CloserEventsRepository } from './closer-events.repository';

@Injectable()
export class CloserEventsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: CloserEventsRepository) {}
  async list(request: ApiRequestDto, query: ListCloserEventsQueryDto): Promise<CloserEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.list(new CloserEventsListDto(context.organizationId, context.userId, query));
  }
  async assignees(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.listAssignees(context.organizationId);
  }
  async act(request: ApiRequestDto, eventId: string, input: CloserEventActionInputDto) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (input.action === 'snooze') {
      const snoozedUntil = new Date(input.snoozedUntil!);
      const maxSnoozeAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      if (snoozedUntil.getTime() <= Date.now() || snoozedUntil.getTime() > maxSnoozeAt) throw new BadRequestException({ code: 'INVALID_SNOOZE_TIME', message: 'Snooze time must be in the future and within 30 days.' });
    }
    const roles = context.role.split(',').map((role) => role.trim());
    const result = await this.repository.act(new CloserEventMutationDto(context.organizationId, eventId, context.userId, roles.find((role) => ['owner', 'admin', 'manager', 'closer'].includes(role)) ?? context.role, input, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CLOSER_EVENT_NOT_FOUND', message: 'An active event in the current organization was not found.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CLOSER_EVENT_NOT_ASSIGNED', message: 'Only the assigned closer or a sales manager can manage this event.' });
    if (result === 'invalid_assignee') throw new BadRequestException({ code: 'INVALID_CLOSER_ASSIGNEE', message: 'The selected user must be an active closer in this organization.' });
    return result;
  }
}
