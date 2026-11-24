import { CHANNEL_PROVIDER } from '../channels/channels.constants';
import { EvolutionMessagingAdapter } from './evolution-messaging.adapter';
import { MetaCloudMessagingAdapter } from './meta-cloud-messaging.adapter';
import { ChannelMessagingAdapterRegistry } from './channel-messaging-adapter.registry';

describe('ChannelMessagingAdapterRegistry capabilities', () => {
  const registry = new ChannelMessagingAdapterRegistry(new EvolutionMessagingAdapter(), new MetaCloudMessagingAdapter());

  it('declares Evolution group replies and participant lookup as supported', () => {
    expect(registry.capabilities(CHANNEL_PROVIDER.evolution)).toMatchObject({ groupReplies: true, groupParticipants: true });
  });

  it('keeps Meta group replies disabled while exposing eligible participant lookup', () => {
    expect(registry.capabilities(CHANNEL_PROVIDER.whatsappCloudApi)).toMatchObject({ groupReplies: false, groupParticipants: true });
  });
});
