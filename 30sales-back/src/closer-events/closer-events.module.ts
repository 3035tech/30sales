import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CloserEventsController } from './closer-events.controller';
import { CloserEventsRepository } from './closer-events.repository';
import { CloserEventsService } from './closer-events.service';

@Module({ controllers: [CloserEventsController], providers: [CloserEventsService, CloserEventsRepository, TenantAccessService] })
export class CloserEventsModule {}
