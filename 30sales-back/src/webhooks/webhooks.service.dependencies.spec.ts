jest.mock('../channels/channel-credential-crypto.service', () => ({ ChannelCredentialCryptoService: class {} }));
jest.mock('../channels/channel-credential-resolver.service', () => ({ ChannelCredentialResolverService: class {} }));
jest.mock('../channels/channels.service', () => ({ ChannelsService: class {} }));
jest.mock('./webhooks.repository', () => ({ WebhooksRepository: class {} }));

import { Test } from '@nestjs/testing';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelsService } from '../channels/channels.service';
import { EvolutionIncomingMessageWebhookAdapter, MetaCloudIncomingMessageWebhookAdapter } from './incoming-message-webhook-adapters';
import { EvolutionMessageStatusWebhookAdapter, MetaCloudMessageStatusWebhookAdapter } from './message-status-webhook-adapters';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService dependency injection', () => {
  it('resolves all webhook adapters from the Nest container', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: WebhooksRepository, useValue: {} },
        { provide: ChannelCredentialCryptoService, useValue: {} },
        { provide: ChannelCredentialResolverService, useValue: {} },
        { provide: ChannelsService, useValue: {} },
        EvolutionMessageStatusWebhookAdapter,
        MetaCloudMessageStatusWebhookAdapter,
        EvolutionIncomingMessageWebhookAdapter,
        MetaCloudIncomingMessageWebhookAdapter,
      ],
    }).compile();

    expect(moduleRef.get(WebhooksService)).toBeInstanceOf(WebhooksService);
    await moduleRef.close();
  });
});
