import { EvolutionIncomingMessageWebhookAdapter } from './incoming-message-webhook-adapters';

describe('EvolutionIncomingMessageWebhookAdapter', () => {
  const organizationId = '72d95f15-4539-47a8-87c8-789d502a8846';
  const channelId = 'a7f52ba0-7bf3-4204-8ce8-89f882a1117a';
  const crypto = { encryptPayload: jest.fn(() => ({ ciphertext: 'ciphertext', iv: 'iv', authTag: 'tag' })) };
  const adapter = new EvolutionIncomingMessageWebhookAdapter(crypto as never);
  const normalize = (value: unknown) => adapter.normalize({
    organizationId, channelId, value, payloadHash: 'payload-hash', classifyCloserSignal: () => null,
  });

  beforeEach(() => jest.clearAllMocks());

  it('normalizes external ad replies as a safe, renderable card', () => {
    const message = normalize({
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'ad-reply', fromMe: false },
      messageType: 'extendedTextMessage', messageTimestamp: 1_795_541_400,
      message: { extendedTextMessage: {
        text: 'Confira a oferta',
        contextInfo: { externalAdReply: { title: 'Oferta', body: 'Último dia', sourceUrl: 'https://example.test/oferta' } },
      } },
    });

    expect(message?.evolutionMetadata?.richContent).toEqual({
      kind: 'card', title: 'Oferta', body: 'Último dia', buttonLabel: null, buttonUrl: 'https://example.test/oferta',
    });
    expect(message?.bodyText).toBe('Oferta\nÚltimo dia');
  });

  it('preserves the normalized type when message content is not yet supported', () => {
    const message = normalize({
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'unsupported-message', fromMe: false },
      message: { futureInteractiveMessage: { payload: 'not persisted' } }, messageTimestamp: 1_795_541_400,
    });

    expect(message?.bodyText).toBeNull();
    expect(message?.evolutionMetadata?.unsupportedType).toBe('futureinteractive');
  });

  it.each(['javascript:alert(1)', 'https://user:password@example.test/path', `https://example.test/${'a'.repeat(2048)}`])(
    'drops unsafe external ad links (%s)', (sourceUrl) => {
      const message = normalize({
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'unsafe-ad-link', fromMe: false },
        messageType: 'extendedTextMessage', messageTimestamp: 1_795_541_400,
        message: { extendedTextMessage: { text: 'Oferta', contextInfo: { externalAdReply: { title: 'Anúncio', sourceUrl } } } },
      });

      expect(message?.evolutionMetadata?.richContent).toEqual({
        kind: 'card', title: 'Anúncio', body: null, buttonLabel: null, buttonUrl: null,
      });
    },
  );
});
