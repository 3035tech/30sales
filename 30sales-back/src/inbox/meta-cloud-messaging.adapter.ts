import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config/env';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import { CHANNEL_PROVIDER } from '../channels/channels.constants';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import { OUTBOUND_MEDIA_MIME_TYPE, OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';
import type { ChannelMessagingAdapter, ContactMessageFields, GroupParticipantsResult, MessagingAdapterContext, ProviderSendResult, QuotedMessage } from './channel-messaging-adapter';

const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;
const groupInfoSchema = z.object({ participants: z.array(z.object({ wa_id: z.string().max(80).optional(), user_id: z.string().max(120).optional(), username: z.string().max(100).optional() }).passthrough()).max(8) });

@Injectable()
export class MetaCloudMessagingAdapter implements ChannelMessagingAdapter {
  readonly provider = CHANNEL_PROVIDER.whatsappCloudApi;
  readonly capabilities = { directMessages: true, groupReplies: false, groupParticipants: true, reactions: true, quotedReplies: true, media: true, contactCards: true } as const;

  async sendText(input: MessagingAdapterContext & { bodyText: string; targetMessage: QuotedMessage | null; mode: 'reply' | 'reaction' }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const url = this.messageUrl(input.providerChannelId);
    const body = input.mode === 'reaction'
      ? input.targetMessage ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'reaction', reaction: { message_id: input.targetMessage.externalMessageId, emoji: input.bodyText } } : null
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'text', text: { body: input.bodyText, preview_url: false }, ...(input.targetMessage ? { context: { message_id: input.targetMessage.externalMessageId } } : {}) };
    return this.post(url, body, credentials.accessToken, 15_000);
  }

  async sendMedia(input: MessagingAdapterContext & { bodyText: string; media: import('./outbound-media').PreparedOutboundMedia }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const baseUrl = this.apiUrl(input.providerChannelId);
    let mediaResponse: Response;
    try {
      const form = new FormData();
      form.set('messaging_product', 'whatsapp');
      form.set('type', input.media.metadata.mimeType);
      form.set('file', new Blob([Uint8Array.from(input.media.content)], { type: input.media.metadata.mimeType }), input.media.metadata.fileName);
      mediaResponse = await fetch(`${baseUrl}/media`, { method: 'POST', headers: { authorization: `Bearer ${credentials.accessToken}` }, body: form, signal: AbortSignal.timeout(30_000), redirect: 'error' });
    } catch { return { deliveryState: 'unknown', externalMessageId: null }; }
    if (!mediaResponse.ok) return { deliveryState: mediaResponse.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const mediaResult = await readLimitedJsonResponse(mediaResponse, MAX_PROVIDER_RESPONSE_BYTES);
    const mediaId = mediaResult.ok ? this.readMediaId(mediaResult.payload) : null;
    if (!mediaId) return { deliveryState: 'unknown', externalMessageId: null };
    const metadata = input.media.metadata;
    const mediaPayload = metadata.mediaType === OUTBOUND_MEDIA_TYPE.document
      ? { id: mediaId, filename: metadata.fileName, caption: input.bodyText }
      : metadata.mediaType === OUTBOUND_MEDIA_TYPE.audio
        ? { id: mediaId, ...(metadata.mimeType === OUTBOUND_MEDIA_MIME_TYPE.oggAudio ? { voice: true } : {}) }
        : { id: mediaId, caption: input.bodyText };
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: metadata.mediaType, [metadata.mediaType]: mediaPayload };
    return this.post(`${baseUrl}/messages`, body, credentials.accessToken, 30_000);
  }

  async sendContact(input: MessagingAdapterContext & { contact: ContactMessageFields }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const digits = input.contact.phoneNumber.replace(/\D/g, '');
    const [firstName = '', ...lastNameParts] = input.contact.fullName.trim().split(/\s+/);
    const contact = { name: { formatted_name: input.contact.fullName, first_name: firstName, ...(lastNameParts.length ? { last_name: lastNameParts.join(' ') } : {}) },
      phones: [{ phone: `+${digits}`, type: 'CELL' }], ...(input.contact.organization ? { org: { company: input.contact.organization } } : {}),
      ...(input.contact.email ? { emails: [{ email: input.contact.email, type: 'WORK' }] } : {}), ...(input.contact.url ? { urls: [{ url: input.contact.url, type: 'WORK' }] } : {}) };
    return this.post(this.messageUrl(input.providerChannelId), { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: 'contacts', contacts: [contact] }, credentials.accessToken, 30_000);
  }

  async listGroupParticipants(input: { providerChannelId: string; groupJid: string; credentials: ChannelCredentialsDto }): Promise<GroupParticipantsResult> {
    const credentials = this.credentials(input.credentials);
    if (!input.groupJid || input.groupJid.length > 300 || input.groupJid.includes('/')) throw new Error('GROUP_IDENTIFIER_INVALID');
    let response: Response;
    try {
      const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.groupJid)}`);
      url.searchParams.set('fields', 'participants');
      response = await fetch(url, { headers: { authorization: `Bearer ${credentials.accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch { throw new Error('GROUP_PARTICIPANTS_UNAVAILABLE'); }
    if (!response.ok) throw new Error('GROUP_PARTICIPANTS_UNAVAILABLE');
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const parsed = result.ok ? groupInfoSchema.safeParse(result.payload) : null;
    if (!parsed?.success) throw new Error('GROUP_PARTICIPANTS_RESPONSE_INVALID');
    return { supported: true, participants: parsed.data.participants.flatMap((participant) => {
      const id = participant.user_id ?? participant.wa_id;
      if (!id) return [];
      const digits = participant.wa_id?.replace(/\D/g, '') ?? '';
      const phone = digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
      return [{ id, phone, name: participant.username ?? null, isAdmin: false }];
    }) };
  }

  private credentials(credentials: ChannelCredentialsDto): Extract<ChannelCredentialsDto, { provider: 'whatsapp_cloud_api' }> {
    if (credentials.provider !== CHANNEL_PROVIDER.whatsappCloudApi) throw new Error('Channel provider configuration does not match its credentials.');
    return credentials;
  }

  private apiUrl(phoneNumberId: string): string { return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}`; }
  private messageUrl(phoneNumberId: string): string { return `${this.apiUrl(phoneNumberId)}/messages`; }

  private async post(url: string, body: unknown, accessToken: string, timeout: number): Promise<ProviderSendResult> {
    if (!body) return { deliveryState: 'failed', externalMessageId: null };
    let response: Response;
    try { response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), redirect: 'error' }); }
    catch { return { deliveryState: 'unknown', externalMessageId: null }; }
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const externalMessageId = result.ok ? this.readMessageId(result.payload) : null;
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private readMediaId(payload: unknown): string | null {
    return typeof payload === 'object' && payload !== null && 'id' in payload && typeof payload.id === 'string' ? payload.id : null;
  }

  private readMessageId(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || !('messages' in payload) || !Array.isArray(payload.messages)) return null;
    const [message] = payload.messages;
    return typeof message === 'object' && message !== null && 'id' in message && typeof message.id === 'string' ? message.id : null;
  }
}
