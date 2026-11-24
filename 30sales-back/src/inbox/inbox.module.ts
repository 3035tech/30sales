import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { ChannelsModule } from '../channels/channels.module';
import { WhatsappTextProviderService } from './whatsapp-text-provider.service';
import { WhatsappMediaProviderService } from './whatsapp-media-provider.service';
import { WhatsappContactProviderService } from './whatsapp-contact-provider.service';
import { InboxRealtimeService } from './inbox-realtime.service';
import { AttachmentsModule } from '../attachments/attachments.module';
@Module({ imports: [ChannelsModule, AttachmentsModule], controllers: [InboxController], providers: [InboxService, InboxRepository, WhatsappTextProviderService, WhatsappMediaProviderService, WhatsappContactProviderService, InboxRealtimeService], exports: [WhatsappTextProviderService, InboxRepository] })
export class InboxModule {}
