import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({ controllers: [AuditController], providers: [AuditService, AuditRepository, TenantAccessService] })
export class AuditModule {}
