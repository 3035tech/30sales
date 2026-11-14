import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { SessionModule } from './session/session.module';
import { HandoffsModule } from './handoffs/handoffs.module';
@Module({ imports: [LeadsModule, SessionModule, HandoffsModule], controllers: [HealthController] })
export class AppModule {}
