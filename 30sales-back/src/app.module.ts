import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { SessionModule } from './session/session.module';
import { HandoffsModule } from './handoffs/handoffs.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { InboxModule } from './inbox/inbox.module';
import { AuditModule } from './audit/audit.module';
import { ImportsModule } from './imports/imports.module';
import { ReportsModule } from './reports/reports.module';
import { AccountsModule } from './accounts/accounts.module';
import { ChannelsModule } from './channels/channels.module';
import { CloserEventsModule } from './closer-events/closer-events.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AgentsModule } from './agents/agents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformModule } from './platform/platform.module';
@Module({ imports: [LeadsModule, SessionModule, PlatformModule, HandoffsModule, OpportunitiesModule, InboxModule, AuditModule, ImportsModule, ReportsModule, AccountsModule, ChannelsModule, WebhooksModule, CloserEventsModule, NotificationsModule, AgentsModule], controllers: [HealthController] })
export class AppModule {}
