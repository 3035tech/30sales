import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { TaskNotificationWorker } from './task-notification.worker';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationsRepository, TaskNotificationWorker] })
export class NotificationsModule {}
