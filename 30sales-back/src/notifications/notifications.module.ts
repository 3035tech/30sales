import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationsRepository, TenantAccessService] })
export class NotificationsModule {}
