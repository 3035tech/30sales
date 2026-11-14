import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
@Module({ controllers: [InboxController], providers: [InboxService, InboxRepository, TenantAccessService] })
export class InboxModule {}
