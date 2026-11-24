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

  it('preserves media messages and campaign card images for authenticated history rendering', () => {
    const mediaFixtures = [
      { type: 'imageMessage', mediaType: 'image' },
      { type: 'videoMessage', mediaType: 'video' },
      { type: 'audioMessage', mediaType: 'audio' },
      { type: 'documentMessage', mediaType: 'document' },
    ] as const;

    for (const [index, fixture] of mediaFixtures.entries()) {
      const message = normalize({
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: `media-${fixture.mediaType}`, fromMe: false },
        messageTimestamp: 1_795_541_400,
        message: { [fixture.type]: { mimetype: `${fixture.mediaType}/test`, fileName: `fixture-${fixture.mediaType}`, fileLength: index + 1 } },
      });

      expect(message?.media).toMatchObject({ mediaType: fixture.mediaType, mimeType: `${fixture.mediaType}/test` });
      expect(message?.media?.sourceCiphertext).toBe('ciphertext');
    }

    const campaign = normalize({
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'campaign-card-image', fromMe: false },
      messageTimestamp: 1_795_541_400,
      message: { templateMessage: { hydratedTemplate: {
        hydratedTitleText: 'Último dia', hydratedContentText: 'Oferta de hoje',
        imageMessage: { mimetype: 'image/jpeg', fileLength: 512 },
      } } },
    });

    expect(campaign?.evolutionMetadata?.richContent).toMatchObject({ kind: 'card', title: 'Último dia', body: 'Oferta de hoje' });
    expect(campaign?.media).toMatchObject({ mediaType: 'image', mimeType: 'image/jpeg' });
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
