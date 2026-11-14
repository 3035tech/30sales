import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { SessionController } from './session/session.controller';
@Module({ controllers: [SessionController, HealthController] }) export class AppModule {}
