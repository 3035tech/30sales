import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ListNotificationsQueryDto, MarkUserNotificationReadDto, UserNotificationsListDto } from './notifications.dto';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: NotificationsRepository) {}
  async list(request: ApiRequestDto, query: ListNotificationsQueryDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.list(new UserNotificationsListDto(context.organizationId, context.userId, query.limit));
  }
  async markRead(request: ApiRequestDto, notificationId: string) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const updated = await this.repository.markRead(new MarkUserNotificationReadDto(notificationId, context.organizationId, context.userId));
    if (!updated) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'A notification in the current organization was not found.' });
    return { id: notificationId, read: true };
  }
}
