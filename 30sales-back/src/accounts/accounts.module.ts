import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AccountsController } from './accounts.controller';
import { AccountsRepository } from './accounts.repository';
import { AccountsService } from './accounts.service';

@Module({ controllers: [AccountsController], providers: [AccountsService, AccountsRepository, TenantAccessService] })
export class AccountsModule {}
