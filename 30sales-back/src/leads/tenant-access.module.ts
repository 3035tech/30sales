import { Global, Module } from '@nestjs/common';
import { TenantAccessRepository } from './tenant-access.repository';
import { TenantAccessService } from './tenant-access.service';

@Global()
@Module({ providers: [TenantAccessRepository, TenantAccessService], exports: [TenantAccessService] })
export class TenantAccessModule {}
