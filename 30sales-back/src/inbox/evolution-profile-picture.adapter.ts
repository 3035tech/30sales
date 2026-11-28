import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { evolutionFetch } from '../common/evolution-http-client';
import type { ChannelCredentialsDto } from '../channels/channels.dto';

const PROFILE_PICTURE_TIMEOUT_MS = 8_000;
const MAX_PROFILE_PICTURE_BYTES = 3 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 32 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type EvolutionCredentials = Extract<ChannelCredentialsDto, { provider: 'evolution' }>;

@Injectable()
export class EvolutionProfilePictureAdapter {
  async fetch(instanceName: string, recipientId: string, credentials: EvolutionCredentials): Promise<{ content: Buffer; mimeType: string } | null> {
    const profileUrl = await this.lookupPictureUrl(instanceName, recipientId, credentials);
    if (!profileUrl) return null;
    const url = this.validatePictureUrl(profileUrl);
    const response = await evolutionFetch(url, { headers: { accept: 'image/jpeg,image/png,image/webp' }, signal: AbortSignal.timeout(PROFILE_PICTURE_TIMEOUT_MS), redirect: 'error' });
    if (response.status === 404) return null;
    if (!response.ok) throw this.unavailable();
    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw this.unavailable();
    const content = await this.readBounded(response, MAX_PROFILE_PICTURE_BYTES);
    if (content.length === 0) throw this.unavailable();
    return { content, mimeType };
  }

  private async lookupPictureUrl(instanceName: string, recipientId: string, credentials: EvolutionCredentials): Promise<string | null> {
    let response: Response;
    try {
      response = await evolutionFetch(`${credentials.baseUrl.replace(/\/+$/, '')}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', apikey: credentials.apiKey },
        body: JSON.stringify({ number: recipientId }), signal: AbortSignal.timeout(PROFILE_PICTURE_TIMEOUT_MS), redirect: 'error',
      });
    } catch { throw this.unavailable(); }
    if (response.status === 404) return null;
    if (!response.ok) throw this.unavailable();
    const payload = await this.readBounded(response, MAX_PROVIDER_RESPONSE_BYTES).catch(() => { throw this.unavailable(); });
    let parsed: unknown;
    try { parsed = JSON.parse(payload.toString('utf8')) as unknown; } catch { throw this.unavailable(); }
    if (typeof parsed !== 'object' || parsed === null || !('profilePictureUrl' in parsed)) return null;
    const value = parsed.profilePictureUrl;
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 2048) throw this.unavailable();
    return value;
  }

  private validatePictureUrl(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw this.unavailable(); }
    const hostname = url.hostname.toLowerCase();
    const trustedWhatsAppHost = hostname === 'whatsapp.net' || hostname.endsWith('.whatsapp.net');
    if (url.protocol !== 'https:' || !trustedWhatsAppHost || url.username || url.password || url.port || url.hash) throw this.unavailable();
    return url;
  }

  private async readBounded(response: Response, maximumBytes: number): Promise<Buffer> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw this.unavailable();
    if (!response.body) throw this.unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maximumBytes) { await reader.cancel(); throw this.unavailable(); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ code: 'PROFILE_PICTURE_UNAVAILABLE', message: 'The profile picture is temporarily unavailable.' });
  }
}
