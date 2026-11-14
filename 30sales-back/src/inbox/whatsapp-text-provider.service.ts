import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '../config/env';
import type { ChannelCredentialsDto } from '../channels/channels.dto';

export type ProviderSendResult = { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };

@Injectable()
export class WhatsappTextProviderService {
  async send(input: { provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; recipientPhone: string; bodyText: string; credentials: ChannelCredentialsDto }): Promise<ProviderSendResult> {
    const url = this.createUrl(input);
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
    const body = this.createBody(input);
    if (input.credentials.provider === 'evolution') headers.set('apikey', input.credentials.apiKey);
    else headers.set('authorization', `Bearer ${input.credentials.accessToken}`);
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') {
      try { await this.assertPublicEvolutionTarget(input.credentials.baseUrl) }
      catch { return { deliveryState: 'failed', externalMessageId: null } }
    }
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch {
      return { deliveryState: 'unknown', externalMessageId: null };
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const externalMessageId = this.readMessageId(input.provider, payload);
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private async assertPublicEvolutionTarget(baseUrl: string): Promise<void> {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) throw new Error('Evolution API host resolves to a non-public address.');
  }

  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 4) {
      const [a, b, c] = address.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224;
    }
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return this.isPrivateAddress(mappedIpv4);
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:192.168.') || normalized.startsWith('::ffff:169.254.');
  }

  private createUrl(input: { provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; credentials: ChannelCredentialsDto }): string {
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') return `${input.credentials.baseUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(input.providerChannelId)}`;
    if (input.provider === 'whatsapp_cloud_api' && input.credentials.provider === 'whatsapp_cloud_api') return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.providerChannelId)}/messages`;
    throw new Error('Channel provider configuration does not match its credential type.');
  }

  private createBody(input: { provider: 'evolution' | 'whatsapp_cloud_api'; recipientPhone: string; bodyText: string; credentials: ChannelCredentialsDto }): unknown {
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') return { number: input.recipientPhone, textMessage: { text: input.bodyText } };
    if (input.provider === 'whatsapp_cloud_api' && input.credentials.provider === 'whatsapp_cloud_api') return { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'text', text: { body: input.bodyText, preview_url: false } };
    throw new Error('Channel provider configuration does not match its credential type.');
  }

  private readMessageId(provider: 'evolution' | 'whatsapp_cloud_api', payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    if (provider === 'evolution') {
      const key = (payload as { key?: unknown }).key;
      if (key && typeof key === 'object' && 'id' in key && typeof key.id === 'string') return key.id;
      return null;
    }
    const messages = (payload as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) return null;
    const [message] = messages;
    return message && typeof message === 'object' && 'id' in message && typeof message.id === 'string' ? message.id : null;
  }
}
