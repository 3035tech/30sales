import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { HandoffsController } from './handoffs.controller';
import { HandoffsRepository } from './handoffs.repository';
import { HandoffsService } from './handoffs.service';

@Module({ controllers: [HandoffsController], providers: [HandoffsService, HandoffsRepository, TenantAccessService] })
export class HandoffsModule {}
