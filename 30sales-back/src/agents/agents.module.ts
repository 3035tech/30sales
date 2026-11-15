import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';

@Module({ controllers: [AgentsController], providers: [AgentsService, AgentsRepository, TenantAccessService] })
export class AgentsModule {}
