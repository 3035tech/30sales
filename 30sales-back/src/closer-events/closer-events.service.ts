import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CloserEventActionInputDto, CloserEventMutationDto, CloserEventsListDto, CloserEventsPageDto, CloserEventSlaPoliciesInputDto, CloserEventSlaPoliciesSaveDto, CloserEventSlaPolicyDto, CloserEventSlaSettingsDto, closerEventTypeValues, CloserSlaNotificationsListDto, CloserSlaNotificationReadDto, ListCloserEventsQueryDto, ListCloserSlaNotificationsQueryDto } from './closer-events.dto';
import { CloserEventsRepository } from './closer-events.repository';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

@Injectable()
export class CloserEventsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: CloserEventsRepository) {}
  async list(request: ApiRequestDto, query: ListCloserEventsQueryDto): Promise<CloserEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const accessibleBusinessLineIds = canManageAll ? null : await this.repository.accessibleBusinessLineIds(context.organizationId, context.userId);
    if (query.businessLineId && accessibleBusinessLineIds && !accessibleBusinessLineIds.includes(query.businessLineId)) throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'Business line was not found in the active organization.' });
    return this.repository.list(new CloserEventsListDto(context.organizationId, context.userId, canManageAll, query, accessibleBusinessLineIds));
  }
  async assignees(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES) && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_EVENT_ROLE_REQUIRED', message: 'Only closers and sales managers can view closer assignees.' });
    return this.repository.listAssignees(context.organizationId);
  }
  async getSlaPolicies(request: ApiRequestDto): Promise<CloserEventSlaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    const configured = await this.repository.getSlaPolicies(context.organizationId);
    const byType = new Map(configured.map((policy) => [policy.eventType, policy]));
    const canManage = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return new CloserEventSlaSettingsDto(closerEventTypeValues.map((eventType) => {
      const policy = byType.get(eventType);
      return new CloserEventSlaPolicyDto(eventType, policy?.targetMinutes ?? null, policy?.escalateToManagers ?? false);
    }), canManage);
  }
  async saveSlaPolicies(request: ApiRequestDto, input: CloserEventSlaPoliciesInputDto): Promise<CloserEventSlaSettingsDto> {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (!hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES)) {
      throw new ForbiddenException({ code: 'CLOSER_EVENT_SLA_MANAGE_REQUIRED', message: 'A sales manager must configure closer event SLAs.' });
    }
    await this.repository.saveSlaPolicies(new CloserEventSlaPoliciesSaveDto(context.organizationId, context.userId, input, request.correlationId));
    return this.getSlaPolicies(request);
  }
  async act(request: ApiRequestDto, eventId: string, input: CloserEventActionInputDto) {
    const context = await this.tenantAccess.require(request, 'update', 'pipeline');
    if (input.action === 'snooze') {
      const snoozedUntil = new Date(input.snoozedUntil);
      const maxSnoozeAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      if (snoozedUntil.getTime() <= Date.now() || snoozedUntil.getTime() > maxSnoozeAt) throw new BadRequestException({ code: 'INVALID_SNOOZE_TIME', message: 'Snooze time must be in the future and within 30 days.' });
    }
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    if (!canManageAll && !hasOrganizationRole(context.role, ORGANIZATION_CLOSER_ROLES)) throw new ForbiddenException({ code: 'CLOSER_EVENT_ROLE_REQUIRED', message: 'Only closers and sales managers can manage closer events.' });
    const result = await this.repository.act(new CloserEventMutationDto(context.organizationId, eventId, context.userId, canManageAll, input, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CLOSER_EVENT_NOT_FOUND', message: 'An active event in the current organization was not found.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CLOSER_EVENT_NOT_ASSIGNED', message: 'Only the assigned closer or a sales manager can manage this event.' });
    if (result === 'invalid_assignee') throw new BadRequestException({ code: 'INVALID_CLOSER_ASSIGNEE', message: 'The selected user must be an active closer in this organization.' });
    return result;
  }
  async listSlaNotifications(request: ApiRequestDto, query: ListCloserSlaNotificationsQueryDto) {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    return this.repository.listSlaNotifications(new CloserSlaNotificationsListDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), query.limit));
  }
  async markSlaNotificationRead(request: ApiRequestDto, notificationId: string) {
    const context = await this.tenantAccess.require(request, 'read', 'pipeline');
    const updated = await this.repository.markSlaNotificationRead(new CloserSlaNotificationReadDto(notificationId, context.organizationId, context.userId));
    if (!updated) throw new NotFoundException({ code: 'CLOSER_SLA_NOTIFICATION_NOT_FOUND', message: 'An unread SLA notification in the current organization was not found.' });
    return { id: notificationId, read: true };
  }
}
