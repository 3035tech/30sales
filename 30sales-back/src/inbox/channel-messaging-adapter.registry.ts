import { Injectable } from '@nestjs/common';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import { EvolutionMessagingAdapter } from './evolution-messaging.adapter';
import { MetaCloudMessagingAdapter } from './meta-cloud-messaging.adapter';
import type { ChannelMessagingAdapter, ChannelMessagingCapabilities, ChannelMessagingProvider, ContactMessageFields, GroupParticipantsResult, MessagingAdapterContext, ProviderSendResult, QuotedMessage } from './channel-messaging-adapter';
import type { PreparedOutboundMedia } from './outbound-media';

@Injectable()
export class ChannelMessagingAdapterRegistry {
  private readonly adapters: ReadonlyMap<ChannelMessagingProvider, ChannelMessagingAdapter>;

  constructor(evolution: EvolutionMessagingAdapter, metaCloud: MetaCloudMessagingAdapter) {
    this.adapters = new Map<ChannelMessagingProvider, ChannelMessagingAdapter>([[evolution.provider, evolution], [metaCloud.provider, metaCloud]]);
  }

  sendText(input: MessagingAdapterContext & { bodyText: string; targetMessage: QuotedMessage | null; mode: 'reply' | 'reaction' }): Promise<ProviderSendResult> {
    return this.adapter(input.credentials).sendText(input);
  }

  sendMedia(input: MessagingAdapterContext & { bodyText: string; media: PreparedOutboundMedia }): Promise<ProviderSendResult> {
    return this.adapter(input.credentials).sendMedia(input);
  }

  sendContact(input: MessagingAdapterContext & { contact: ContactMessageFields }): Promise<ProviderSendResult> {
    return this.adapter(input.credentials).sendContact(input);
  }

  sendPresence(input: MessagingAdapterContext & { state: 'composing' | 'paused' }): Promise<void> {
    const adapter = this.adapter(input.credentials);
    return adapter.sendPresence ? adapter.sendPresence(input) : Promise.resolve();
  }

  listGroupParticipants(input: { providerChannelId: string; groupJid: string; credentials: ChannelCredentialsDto }): Promise<GroupParticipantsResult> {
    return this.adapter(input.credentials).listGroupParticipants(input);
  }

  capabilities(provider: ChannelMessagingProvider): ChannelMessagingCapabilities {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error('Channel provider adapter is not registered.');
    return adapter.capabilities;
  }

  private adapter(credentials: ChannelCredentialsDto): ChannelMessagingAdapter {
    const adapter = this.adapters.get(credentials.provider);
    if (!adapter) throw new Error('Channel provider adapter is not registered.');
    return adapter;
  }
}
