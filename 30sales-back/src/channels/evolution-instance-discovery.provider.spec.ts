import { EVOLUTION_DISCOVERY_ERROR, EvolutionInstanceDiscoveryProvider } from './evolution-instance-discovery.provider';

describe('EvolutionInstanceDiscoveryProvider', () => {
  const provider = new EvolutionInstanceDiscoveryProvider();
  const originalFetch = globalThis.fetch;
  const credentials = { baseUrl: 'https://8.8.8.8', apiKey: 'test-key' };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([401, 403])('reports rejected credentials for HTTP %s', async (status) => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status }));

    await expect(provider.list(credentials)).rejects.toMatchObject({
      response: { code: EVOLUTION_DISCOVERY_ERROR.keyRejected },
    });
  });

  it('reports the upstream HTTP status for server errors', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(provider.list(credentials)).rejects.toMatchObject({
      response: { code: EVOLUTION_DISCOVERY_ERROR.requestFailed, message: expect.stringContaining('HTTP 503') },
    });
  });

  it('reports a connection timeout separately', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));

    await expect(provider.list(credentials)).rejects.toMatchObject({
      response: { code: EVOLUTION_DISCOVERY_ERROR.timeout },
    });
  });

  it('accepts a valid empty instance list', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(Response.json([]));

    await expect(provider.list(credentials)).resolves.toEqual([]);
  });
});
