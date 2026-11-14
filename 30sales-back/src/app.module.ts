import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { SessionModule } from './session/session.module';
import { HandoffsModule } from './handoffs/handoffs.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
@Module({ imports: [LeadsModule, SessionModule, HandoffsModule, OpportunitiesModule], controllers: [HealthController] })
export class AppModule {}
