import { EvolutionWebhookConfigurationProvider } from './evolution-webhook-configuration.provider';

describe('EvolutionWebhookConfigurationProvider', () => {
  const provider = new EvolutionWebhookConfigurationProvider();
  const originalFetch = globalThis.fetch;
  const credentials = { provider: 'evolution' as const, baseUrl: 'https://8.8.8.8', apiKey: 'test-key', webhookSecret: 'test-secret' };
  const instanceName = 'sales-test';
  const channelId = 'channel-test';

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sets the Evolution webhook and confirms URL, secret, modes, and the full v2.3.7 event list', async () => {
    const callbackUrl = `http://localhost:5173/api/v1/webhooks/evolution/${channelId}`;
    const configuredEvents = [
      'APPLICATION_STARTUP', 'CALL', 'CHATS_DELETE', 'CHATS_SET', 'CHATS_UPDATE', 'CHATS_UPSERT',
      'CONNECTION_UPDATE', 'CONTACTS_SET', 'CONTACTS_UPDATE', 'CONTACTS_UPSERT',
      'GROUP_PARTICIPANTS_UPDATE', 'GROUP_UPDATE', 'GROUPS_UPSERT', 'LABELS_ASSOCIATION', 'LABELS_EDIT',
      'LOGOUT_INSTANCE', 'MESSAGES_DELETE', 'MESSAGES_EDITED', 'MESSAGES_SET', 'MESSAGES_UPDATE', 'MESSAGES_UPSERT',
      'PRESENCE_UPDATE', 'QRCODE_UPDATED', 'REMOVE_INSTANCE', 'SEND_MESSAGE', 'SEND_MESSAGE_UPDATE', 'TYPEBOT_CHANGE_STATUS', 'TYPEBOT_START',
    ];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        enabled: true,
        url: callbackUrl,
        webhookByEvents: false,
        webhookBase64: false,
        headers: { 'x-30sales-webhook-key': credentials.webhookSecret },
        events: configuredEvents,
      }));
    globalThis.fetch = fetchMock;

    await expect(provider.configure(credentials, instanceName, channelId)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [setUrl, setRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(setUrl).toBe('https://8.8.8.8/webhook/set/sales-test');
    expect(JSON.parse(String(setRequest.body))).toEqual({ webhook: {
      enabled: true,
      url: callbackUrl,
      headers: { 'X-30Sales-Webhook-Key': credentials.webhookSecret },
      events: configuredEvents,
      byEvents: false,
      base64: false,
    } });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://8.8.8.8/webhook/find/sales-test');
  });

  it('fails closed when Evolution accepts the write but does not retain the secret header', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ enabled: true, url: 'http://localhost:5173/api/v1/webhooks/evolution/channel-test', webhookByEvents: false, webhookBase64: false, headers: {}, events: [] }));

    await expect(provider.configure(credentials, instanceName, channelId)).rejects.toMatchObject({
      response: { code: 'EVOLUTION_WEBHOOK_NOT_CONFIRMED' },
    });
  });
});
