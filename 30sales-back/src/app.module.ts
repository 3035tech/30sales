import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { SessionModule } from './session/session.module';
import { HandoffsModule } from './handoffs/handoffs.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { InboxModule } from './inbox/inbox.module';
import { AuditModule } from './audit/audit.module';
@Module({ imports: [LeadsModule, SessionModule, HandoffsModule, OpportunitiesModule, InboxModule, AuditModule], controllers: [HealthController] })
export class AppModule {}
