import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { TenantAccessService } from './tenant-access.service';
@Module({ controllers: [LeadsController], providers: [LeadsService, LeadsRepository, TenantAccessService] })
export class LeadsModule {}
