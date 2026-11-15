import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { TaskNotificationWorker } from './task-notification.worker';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationsRepository, TaskNotificationWorker, TenantAccessService] })
export class NotificationsModule {}
