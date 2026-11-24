import { Injectable } from '@nestjs/common';
import { CHANNEL_PROVIDER } from '../channels/channels.constants';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import { env } from '../config/env';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import type { SendConversationContactDto } from './inbox.dto';
import type { ProviderSendResult } from './whatsapp-text-provider.service';

type ContactFields = Omit<SendConversationContactDto, 'idempotencyKey'>;

@Injectable()
export class WhatsappContactProviderService {
  async send(input: { providerChannelId: string; recipientPhone: string; contact: ContactFields; credentials: ChannelCredentialsDto }): Promise<ProviderSendResult> {
    if (input.credentials.provider === CHANNEL_PROVIDER.evolution) {
      try { await assertPublicEvolutionTarget(input.credentials.baseUrl) }
      catch { return { deliveryState: 'failed', externalMessageId: null } }
      return this.sendEvolution(input, input.credentials);
    }
    return this.sendCloud(input, input.credentials);
  }

  private async sendEvolution(input: { providerChannelId: string; recipientPhone: string; contact: ContactFields }, credentials: Extract<ChannelCredentialsDto, { provider: typeof CHANNEL_PROVIDER.evolution }>): Promise<ProviderSendResult> {
    const digits = input.contact.phoneNumber.replace(/\D/g, '');
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/message/sendContact/${encodeURIComponent(input.providerChannelId)}`;
    return this.post(url, { number: input.recipientPhone, contact: [{
      fullName: input.contact.fullName,
      wuid: `${digits}@s.whatsapp.net`,
      phoneNumber: `+${digits}`,
      ...(input.contact.organization ? { organization: input.contact.organization } : {}),
      ...(input.contact.email ? { email: input.contact.email } : {}),
      ...(input.contact.url ? { url: input.contact.url } : {}),
    }] }, { apikey: credentials.apiKey });
  }

  private async sendCloud(input: { providerChannelId: string; recipientPhone: string; contact: ContactFields }, credentials: Extract<ChannelCredentialsDto, { provider: typeof CHANNEL_PROVIDER.whatsappCloudApi }>): Promise<ProviderSendResult> {
    const digits = input.contact.phoneNumber.replace(/\D/g, '');
    const [firstName = '', ...lastNameParts] = input.contact.fullName.trim().split(/\s+/);
    const contact = {
      name: { formatted_name: input.contact.fullName, first_name: firstName, ...(lastNameParts.length ? { last_name: lastNameParts.join(' ') } : {}) },
      phones: [{ phone: `+${digits}`, type: 'CELL' }],
      ...(input.contact.organization ? { org: { company: input.contact.organization } } : {}),
      ...(input.contact.email ? { emails: [{ email: input.contact.email, type: 'WORK' }] } : {}),
      ...(input.contact.url ? { urls: [{ url: input.contact.url, type: 'WORK' }] } : {}),
    };
    const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.providerChannelId)}/messages`;
    return this.post(url, { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'contacts', contacts: [contact] }, { authorization: `Bearer ${credentials.accessToken}` });
  }

  private async post(url: string, body: unknown, headers: Record<string, string>): Promise<ProviderSendResult> {
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: 'error' });
    } catch {
      return { deliveryState: 'unknown', externalMessageId: null };
    }
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const payload: unknown = await response.json().catch(() => null);
    if (typeof payload !== 'object' || payload === null) return { deliveryState: 'unknown', externalMessageId: null };
    if ('key' in payload && typeof payload.key === 'object' && payload.key !== null && 'id' in payload.key && typeof payload.key.id === 'string') return { deliveryState: 'accepted', externalMessageId: payload.key.id };
    if ('messages' in payload && Array.isArray(payload.messages)) {
      const [message] = payload.messages;
      if (typeof message === 'object' && message !== null && 'id' in message && typeof message.id === 'string') return { deliveryState: 'accepted', externalMessageId: message.id };
    }
    return { deliveryState: 'unknown', externalMessageId: null };
  }
}
