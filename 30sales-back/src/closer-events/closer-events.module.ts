import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CloserEventsController } from './closer-events.controller';
import { CloserEventsRepository } from './closer-events.repository';
import { CloserEventsService } from './closer-events.service';
import { CloserSlaNotificationWorker } from './closer-sla-notification.worker';

@Module({ controllers: [CloserEventsController], providers: [CloserEventsService, CloserEventsRepository, CloserSlaNotificationWorker, TenantAccessService] })
export class CloserEventsModule {}
