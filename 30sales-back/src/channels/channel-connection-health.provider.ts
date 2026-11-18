import { Injectable } from '@nestjs/common';
import { env } from '../config/env';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import type { ChannelCredentialsDto, ChannelHealthStatus, ChannelHealthCheckTargetDto } from './channels.dto';

const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

@Injectable()
export class ChannelConnectionHealthProvider {
  async check(target: ChannelHealthCheckTargetDto, credentials: ChannelCredentialsDto): Promise<ChannelHealthStatus> {
    if (target.provider !== credentials.provider) return 'configuration_error';
    return credentials.provider === 'evolution'
      ? this.checkEvolution(target.providerChannelId, credentials)
      : this.checkCloudApi(target.providerChannelId, credentials);
  }

  private async checkEvolution(instanceName: string, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<ChannelHealthStatus> {
    try {
      await assertPublicEvolutionTarget(credentials.baseUrl);
    } catch (error) {
      return error instanceof UnsafeExternalTargetError ? 'configuration_error' : 'unavailable';
    }

    let response: Response;
    try {
      const url = `${credentials.baseUrl.replace(/\/+$/, '')}/instance/connectionState/${encodeURIComponent(instanceName)}`;
      response = await fetch(url, { method: 'GET', headers: { accept: 'application/json', apikey: credentials.apiKey }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error' });
    } catch {
      return 'unavailable';
    }
    if (!response.ok) return this.classifyHttpStatus(response.status);

    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const payload = result.ok ? result.payload : null;
    if (!this.isRecord(payload) || !this.isRecord(payload.instance) || typeof payload.instance.state !== 'string') return 'unknown';
    const state = payload.instance.state.toLowerCase();
    if (state === 'open' || state === 'connected') return 'connected';
    if (state === 'connecting') return 'connecting';
    if (state === 'close' || state === 'closed' || state === 'disconnected') return 'disconnected';
    return 'unknown';
  }

  private async checkCloudApi(phoneNumberId: string, credentials: Extract<ChannelCredentialsDto, { provider: 'whatsapp_cloud_api' }>): Promise<ChannelHealthStatus> {
    const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}`);
    url.searchParams.set('fields', 'id,display_phone_number');
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${credentials.accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error' });
    } catch {
      return 'unavailable';
    }
    if (!response.ok) {
      if (response.status === 400) {
        const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
        const payload = result.ok ? result.payload : null;
        if (this.isRecord(payload) && this.isRecord(payload.error) && payload.error.code === 190) return 'credentials_invalid';
      }
      return this.classifyHttpStatus(response.status);
    }

    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const payload = result.ok ? result.payload : null;
    if (!this.isRecord(payload) || typeof payload.id !== 'string') return 'unknown';
    return payload.id === phoneNumberId ? 'reachable' : 'configuration_error';
  }

  private classifyHttpStatus(status: number): ChannelHealthStatus {
    if (status === 401 || status === 403) return 'credentials_invalid';
    if (status === 404) return 'configuration_error';
    if (status === 429 || status >= 500) return 'unavailable';
    return 'configuration_error';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
