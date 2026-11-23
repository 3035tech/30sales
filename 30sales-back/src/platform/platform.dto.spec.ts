import { checkPlatformEvolutionConnectionSchema, platformAiUsageQuerySchema } from './platform.dto';

describe('checkPlatformEvolutionConnectionSchema', () => {
  it('accepts a URL and key for a connection test without saving', () => {
    expect(checkPlatformEvolutionConnectionSchema.safeParse({ baseUrl: 'https://evolution.example.com', apiKey: 'test-key' }).success).toBe(true);
  });

  it('accepts an empty payload to test the saved configuration', () => {
    expect(checkPlatformEvolutionConnectionSchema.safeParse({}).success).toBe(true);
  });

  it('requires URL and key together and rejects local targets', () => {
    expect(checkPlatformEvolutionConnectionSchema.safeParse({ baseUrl: 'https://evolution.example.com' }).success).toBe(false);
    expect(checkPlatformEvolutionConnectionSchema.safeParse({ apiKey: 'test-key' }).success).toBe(false);
    expect(checkPlatformEvolutionConnectionSchema.safeParse({ baseUrl: 'http://localhost:8080', apiKey: 'test-key' }).success).toBe(false);
  });
});

describe('platformAiUsageQuerySchema', () => {
  it('accepts an ordered date range within the maximum period', () => {
    expect(platformAiUsageQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
  });

  it('rejects reversed or oversized date ranges', () => {
    expect(platformAiUsageQuerySchema.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success).toBe(false);
    expect(platformAiUsageQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02' }).success).toBe(false);
  });
});
