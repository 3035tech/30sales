import { Injectable } from '@nestjs/common';
import { env } from '../config/env';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import type { ChannelCredentialsDto } from '../channels/channels.dto';

export type ProviderSendResult = { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };
const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;

@Injectable()
export class WhatsappTextProviderService {
  async send(input: { provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; recipientPhone: string; bodyText: string; credentials: ChannelCredentialsDto }): Promise<ProviderSendResult> {
    const url = this.createUrl(input);
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
    const body = this.createBody(input);
    if (input.credentials.provider === 'evolution') headers.set('apikey', input.credentials.apiKey);
    else headers.set('authorization', `Bearer ${input.credentials.accessToken}`);
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') {
      try { await assertPublicEvolutionTarget(input.credentials.baseUrl) }
      catch { return { deliveryState: 'failed', externalMessageId: null } }
    }
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch {
      return { deliveryState: 'unknown', externalMessageId: null };
    }
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const externalMessageId = result.ok ? this.readMessageId(input.provider, result.payload) : null;
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private createUrl(input: { provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; credentials: ChannelCredentialsDto }): string {
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') return `${input.credentials.baseUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(input.providerChannelId)}`;
    if (input.provider === 'whatsapp_cloud_api' && input.credentials.provider === 'whatsapp_cloud_api') return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.providerChannelId)}/messages`;
    throw new Error('Channel provider configuration does not match its credential type.');
  }

  private createBody(input: { provider: 'evolution' | 'whatsapp_cloud_api'; recipientPhone: string; bodyText: string; credentials: ChannelCredentialsDto }): unknown {
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') return { number: input.recipientPhone, text: input.bodyText };
    if (input.provider === 'whatsapp_cloud_api' && input.credentials.provider === 'whatsapp_cloud_api') return { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'text', text: { body: input.bodyText, preview_url: false } };
    throw new Error('Channel provider configuration does not match its credential type.');
  }

  private readMessageId(provider: 'evolution' | 'whatsapp_cloud_api', payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    if (provider === 'evolution') {
      if (!('key' in payload) || typeof payload.key !== 'object' || payload.key === null || !('id' in payload.key) || typeof payload.key.id !== 'string') return null;
      return payload.key.id;
    }
    if (!('messages' in payload) || !Array.isArray(payload.messages)) return null;
    const [message] = payload.messages;
    return message && typeof message === 'object' && 'id' in message && typeof message.id === 'string' ? message.id : null;
  }
}
