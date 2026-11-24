jest.mock('../channels/channel-credential-resolver.service', () => ({ ChannelCredentialResolverService: class {} }));
jest.mock('../channels/channel-credential-crypto.service', () => ({ ChannelCredentialCryptoService: class {} }));
jest.mock('../channels/channels.service', () => ({ ChannelsService: class {} }));
jest.mock('./webhooks.repository', () => ({ WebhooksRepository: class {} }));

import { WebhooksService } from './webhooks.service';

describe('WebhooksService Evolution events', () => {
  const organizationId = '72d95f15-4539-47a8-87c8-789d502a8846';
  const channelId = 'a7f52ba0-7bf3-4204-8ce8-89f882a1117a';
  const webhookSecret = 'test-webhook-secret-that-is-long-enough';
  const repository = {
    findEvolutionChannel: jest.fn(),
    publishEvolutionPresence: jest.fn(),
    recordProviderEvent: jest.fn(),
    enqueueEvolutionHistoryBatch: jest.fn(),
    recordIncomingMessage: jest.fn(),
    recordEvolutionOutgoingMessage: jest.fn(),
  };
  const credentialCrypto = { encryptPayload: jest.fn() };
  const credentialResolver = { resolve: jest.fn() };
  const channelsService = { recordEvolutionConnectionStatus: jest.fn() };
  const service = new WebhooksService(
    repository as never,
    credentialCrypto as never,
    credentialResolver as never,
    channelsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findEvolutionChannel.mockResolvedValue({
      id: channelId,
      organizationId,
      provider: 'evolution',
      providerChannelId: 'instance-test',
      isActive: true,
      credentialsCiphertext: 'encrypted',
      credentialsIv: 'iv',
      credentialsAuthTag: 'tag',
    });
    credentialResolver.resolve.mockResolvedValue({ provider: 'evolution', webhookSecret });
    credentialCrypto.encryptPayload.mockReturnValue({ ciphertext: 'ciphertext', iv: 'iv', authTag: 'tag' });
    repository.recordProviderEvent.mockResolvedValue('created');
    repository.enqueueEvolutionHistoryBatch.mockResolvedValue(true);
    repository.recordIncomingMessage.mockResolvedValue('created');
    repository.recordEvolutionOutgoingMessage.mockResolvedValue('created');
  });

  async function ingest(data: unknown, event: string): Promise<{ accepted: true; processed: number }> {
    const payload = { event, instance: 'instance-test', data };
    return service.ingestEvolution(channelId, webhookSecret, payload, Buffer.from(JSON.stringify(payload)));
  }

  it('routes group typing presence only to the matching tenant channel conversation', async () => {
    repository.publishEvolutionPresence.mockResolvedValue(true);

    await expect(ingest({
      id: '120363000000000000@g.us',
      presences: { '5511999999999@s.whatsapp.net': { lastKnownPresence: 'composing' } },
    }, 'PRESENCE_UPDATE')).resolves.toEqual({ accepted: true, processed: 1 });

    expect(repository.publishEvolutionPresence).toHaveBeenCalledWith({
      organizationId,
      channelId,
      externalConversationId: `${channelId}:120363000000000000@g.us`,
      state: 'composing',
      participantId: '5511999999999@s.whatsapp.net',
    });
  });

  it('queues MESSAGES_SET inbound messages for known direct and group identifiers', async () => {
    const result = await ingest({
      messages: [
        {
          key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'message-direct', fromMe: false },
          pushName: 'Contato teste',
          message: { conversation: 'Mensagem de fixture' },
          messageTimestamp: 1_795_541_400,
        },
        {
          key: { remoteJid: '120363000000000000@g.us', participant: '5511888888888@s.whatsapp.net', id: 'message-group', fromMe: false },
          pushName: 'Participante teste',
          message: { conversation: 'Mensagem de grupo de fixture' },
          messageTimestamp: 1_795_541_401,
        },
      ],
      isLatest: true,
      progress: 100,
    }, 'MESSAGES_SET');

    expect(result).toEqual({ accepted: true, processed: 2 });
    expect(credentialCrypto.encryptPayload).toHaveBeenCalledWith(organizationId, channelId, expect.any(String));
    const serializedBatch = credentialCrypto.encryptPayload.mock.calls[0]?.[2];
    expect(typeof serializedBatch).toBe('string');
    const queuedMessages: unknown = JSON.parse(serializedBatch as string);
    expect(queuedMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ organizationId, channelId, externalConversationId: `${channelId}:5511999999999` }),
      expect.objectContaining({ organizationId, channelId, externalConversationId: `${channelId}:120363000000000000@g.us`, conversationType: 'group' }),
    ]));
    expect(repository.enqueueEvolutionHistoryBatch).toHaveBeenCalledWith(expect.objectContaining({ organizationId, channelId }));
  });

  it('routes a fromMe MESSAGES_UPSERT echo to the outbound path', async () => {
    const result = await ingest({
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'message-outbound-live', fromMe: true },
      pushName: 'Thomas', message: { conversation: 'Enviado pelo celular' }, messageTimestamp: 1_795_541_400,
    }, 'MESSAGES_UPSERT');

    expect(result).toEqual({ accepted: true, processed: 1 });
    expect(repository.recordEvolutionOutgoingMessage).toHaveBeenCalledWith(expect.objectContaining({
      externalMessageId: 'message-outbound-live', bodyText: 'Enviado pelo celular', isFromMe: true,
    }));
    expect(repository.recordIncomingMessage).not.toHaveBeenCalled();
  });

  it('preserves fromMe messages in encrypted MESSAGES_SET history batches', async () => {
    const result = await ingest({
      messages: [{
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'message-outbound-history', fromMe: true },
        pushName: 'Thomas', message: { conversation: 'Histórico enviado pelo celular' }, messageTimestamp: 1_795_541_400,
      }], isLatest: true, progress: 100,
    }, 'MESSAGES_SET');

    expect(result).toEqual({ accepted: true, processed: 1 });
    const serializedBatch = credentialCrypto.encryptPayload.mock.calls[0]?.[2];
    expect(JSON.parse(serializedBatch as string)).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalMessageId: 'message-outbound-history', isFromMe: true }),
    ]));
  });
});
