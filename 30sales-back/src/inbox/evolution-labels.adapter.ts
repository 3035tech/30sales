import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { evolutionFetch } from '../common/evolution-http-client';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import type { ChannelCredentialsDto } from '../channels/channels.dto';

export type EvolutionLabel = { readonly id: string; readonly name: string; readonly color: string };
const RESPONSE_LIMIT = 64 * 1024;

@Injectable()
export class EvolutionLabelsAdapter {
  async list(instanceName: string, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<EvolutionLabel[]> {
    const payload = await this.request(credentials, `/label/findLabels/${encodeURIComponent(instanceName)}`, 'GET');
    const values = Array.isArray(payload) ? payload : typeof payload === 'object' && payload !== null && Array.isArray((payload as Record<string, unknown>).data) ? (payload as { data: unknown[] }).data : [];
    return values.slice(0, 200).flatMap((value): EvolutionLabel[] => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || row.name.length > 64) return [];
      return [{ id: row.id.slice(0, 120), name: row.name.trim(), color: typeof row.color === 'string' && /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : '#dbeafe' }];
    });
  }

  async apply(instanceName: string, number: string, labelId: string, add: boolean, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<void> {
    await this.request(credentials, `/label/handleLabel/${encodeURIComponent(instanceName)}`, 'POST', { number, labelId, action: add ? 'add' : 'remove' });
  }

  private async request(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>, path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) { throw new ServiceUnavailableException({ code: 'EVOLUTION_LABELS_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is unavailable.' : 'The Evolution API could not be reached.' }); }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await evolutionFetch(new URL(path, `${credentials.baseUrl.replace(/\/+$/, '')}/`), { method, signal: controller.signal, headers: { accept: 'application/json', apikey: credentials.apiKey, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await readLimitedJsonResponse(response, RESPONSE_LIMIT);
      if (!response.ok || !result.ok) throw new Error('EVOLUTION_LABELS_REJECTED');
      return result.payload;
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_LABELS_UNAVAILABLE', message: 'The Evolution API could not complete the label operation.' });
    } finally { clearTimeout(timeout); }
  }
}
