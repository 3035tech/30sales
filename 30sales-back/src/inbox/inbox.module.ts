import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { ChannelsModule } from '../channels/channels.module';
import { WhatsappTextProviderService } from './whatsapp-text-provider.service';
import { InboxRealtimeService } from './inbox-realtime.service';
@Module({ imports: [ChannelsModule], controllers: [InboxController], providers: [InboxService, InboxRepository, TenantAccessService, WhatsappTextProviderService, InboxRealtimeService], exports: [WhatsappTextProviderService] })
export class InboxModule {}
