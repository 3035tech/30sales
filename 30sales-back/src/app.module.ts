import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { SessionModule } from './session/session.module';
@Module({ imports: [LeadsModule, SessionModule], controllers: [HealthController] })
export class AppModule {}
