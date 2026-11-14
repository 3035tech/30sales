import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({ controllers: [ReportsController], providers: [ReportsService, ReportsRepository, TenantAccessService] })
export class ReportsModule {}
