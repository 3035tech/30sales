import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { ChannelsModule } from '../channels/channels.module';
import { ChannelMessagingAdapterRegistry } from './channel-messaging-adapter.registry';
import { EvolutionMessagingAdapter } from './evolution-messaging.adapter';
import { MetaCloudMessagingAdapter } from './meta-cloud-messaging.adapter';
import { InboxRealtimeService } from './inbox-realtime.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { EvolutionProfilePictureAdapter } from './evolution-profile-picture.adapter';
@Module({ imports: [ChannelsModule, AttachmentsModule], controllers: [InboxController], providers: [InboxService, InboxRepository, ChannelMessagingAdapterRegistry, EvolutionMessagingAdapter, MetaCloudMessagingAdapter, EvolutionProfilePictureAdapter, InboxRealtimeService], exports: [ChannelMessagingAdapterRegistry, InboxRepository] })
export class InboxModule {}
