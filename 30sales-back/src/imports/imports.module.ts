import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({ controllers: [ImportsController], providers: [ImportsService, ImportsRepository, TenantAccessService] })
export class ImportsModule {}
