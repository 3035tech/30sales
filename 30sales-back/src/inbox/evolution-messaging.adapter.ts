import { Injectable, Logger } from '@nestjs/common';
import { evolutionFetch } from '../common/evolution-http-client';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import { CHANNEL_PROVIDER } from '../channels/channels.constants';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import { OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';
import { z } from 'zod';
import type { ChannelMessagingAdapter, ContactMessageFields, GroupParticipant, GroupParticipantsResult, MessagingAdapterContext, ProviderSendResult, QuotedMessage } from './channel-messaging-adapter';

const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;
const MAX_GROUP_PARTICIPANTS_RESPONSE_BYTES = 256 * 1024;
const EVOLUTION_AUDIO_MESSAGE_ENDPOINT = 'sendWhatsAppAudio';
const EVOLUTION_AUDIO_FORM_FIELD = { number: 'number', audio: 'audio', file: 'file' } as const;
const groupParticipantsSchema = z.object({ participants: z.array(z.object({ id: z.string().max(250), name: z.string().max(160).nullish(), admin: z.union([z.string(), z.boolean()]).nullish() }).passthrough()).max(1000) });

@Injectable()
export class EvolutionMessagingAdapter implements ChannelMessagingAdapter {
  private readonly logger = new Logger(EvolutionMessagingAdapter.name);
  readonly provider = CHANNEL_PROVIDER.evolution;
  readonly capabilities = { directMessages: true, groupReplies: true, groupParticipants: true, reactions: true, quotedReplies: true, media: true, contactCards: true } as const;

  async sendText(input: MessagingAdapterContext & { bodyText: string; targetMessage: QuotedMessage | null; mode: 'reply' | 'reaction' }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const endpoint = input.mode === 'reaction' ? 'sendReaction' : 'sendText';
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/message/${endpoint}/${encodeURIComponent(input.providerChannelId)}`;
    const body = input.mode === 'reaction'
      ? input.targetMessage ? { key: this.messageKey(input.recipientPhone, input.targetMessage), reaction: input.bodyText } : null
      : { number: input.recipientPhone, text: input.bodyText, ...(input.targetMessage ? { quoted: { key: this.messageKey(input.recipientPhone, input.targetMessage), message: { conversation: input.targetMessage.bodyText ?? '' } } } : {}) };
    return this.post(url, body, { apikey: credentials.apiKey }, 15_000, input);
  }

  async sendMedia(input: MessagingAdapterContext & { bodyText: string; media: import('./outbound-media').PreparedOutboundMedia }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const { metadata, content } = input.media;
    const audio = metadata.mediaType === OUTBOUND_MEDIA_TYPE.audio;
    const endpoint = audio ? EVOLUTION_AUDIO_MESSAGE_ENDPOINT : 'sendMedia';
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/message/${endpoint}/${encodeURIComponent(input.providerChannelId)}`;
    if (audio) {
      const form = new FormData();
      form.set(EVOLUTION_AUDIO_FORM_FIELD.number, input.recipientPhone);
      form.set(EVOLUTION_AUDIO_FORM_FIELD.audio, content.toString('base64'));
      form.set(EVOLUTION_AUDIO_FORM_FIELD.file, new Blob([Uint8Array.from(content)], { type: metadata.mimeType }), metadata.fileName);
      return this.postForm(url, form, { apikey: credentials.apiKey }, 30_000, input);
    }
    const body = { number: input.recipientPhone, mediatype: metadata.mediaType, mimetype: metadata.mimeType, caption: input.bodyText, media: content.toString('base64'), fileName: metadata.fileName };
    return this.post(url, body, { apikey: credentials.apiKey }, 30_000, input);
  }

  async sendContact(input: MessagingAdapterContext & { contact: ContactMessageFields }): Promise<ProviderSendResult> {
    const credentials = this.credentials(input.credentials);
    const digits = input.contact.phoneNumber.replace(/\D/g, '');
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/message/sendContact/${encodeURIComponent(input.providerChannelId)}`;
    const body = { number: input.recipientPhone, contact: [{ fullName: input.contact.fullName, wuid: `${digits}@s.whatsapp.net`, phoneNumber: `+${digits}`,
      ...(input.contact.organization ? { organization: input.contact.organization } : {}), ...(input.contact.email ? { email: input.contact.email } : {}), ...(input.contact.url ? { url: input.contact.url } : {}) }] };
    return this.post(url, body, { apikey: credentials.apiKey }, 30_000, input);
  }

  async sendPresence(input: MessagingAdapterContext & { state: 'composing' | 'paused' }): Promise<void> {
    const credentials = this.credentials(input.credentials);
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/chat/sendPresence/${encodeURIComponent(input.providerChannelId)}`;
    try { await assertPublicEvolutionTarget(url); } catch { throw new Error('EVOLUTION_PRESENCE_TARGET_INVALID'); }
    let response: Response;
    try {
      response = await evolutionFetch(url, { method: 'POST', headers: { apikey: credentials.apiKey, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ number: input.recipientPhone, options: { presence: input.state } }), signal: AbortSignal.timeout(5_000), redirect: 'error' });
    } catch { throw new Error('EVOLUTION_PRESENCE_REQUEST_FAILED'); }
    await response.body?.cancel();
    if (!response.ok) throw new Error('EVOLUTION_PRESENCE_REJECTED');
  }

  async listGroupParticipants(input: { providerChannelId: string; groupJid: string; credentials: ChannelCredentialsDto }): Promise<GroupParticipantsResult> {
    const credentials = this.credentials(input.credentials);
    if (!input.groupJid.endsWith('@g.us') || input.groupJid.length > 250) throw new Error('GROUP_IDENTIFIER_INVALID');
    const url = new URL(`${credentials.baseUrl.replace(/\/+$/, '')}/group/participants/${encodeURIComponent(input.providerChannelId)}`);
    url.searchParams.set('groupJid', input.groupJid);
    await assertPublicEvolutionTarget(url.toString());
    let response: Response;
    try { response = await evolutionFetch(url, { headers: { apikey: credentials.apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(15_000), redirect: 'error' }); }
    catch { throw new Error('GROUP_PARTICIPANTS_UNAVAILABLE'); }
    if (!response.ok) throw new Error('GROUP_PARTICIPANTS_UNAVAILABLE');
    const result = await readLimitedJsonResponse(response, MAX_GROUP_PARTICIPANTS_RESPONSE_BYTES);
    const parsed = result.ok ? groupParticipantsSchema.safeParse(result.payload) : null;
    if (!parsed?.success) throw new Error('GROUP_PARTICIPANTS_RESPONSE_INVALID');
    const participants: GroupParticipant[] = parsed.data.participants.map((participant) => {
      const digits = participant.id.split('@')[0].split(':')[0].replace(/\D/g, '');
      const phone = digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
      return { id: participant.id, phone, name: participant.name?.trim() || null, isAdmin: participant.admin === 'admin' || participant.admin === true || participant.admin === 'superadmin' };
    });
    return { supported: true, participants };
  }

  private credentials(credentials: ChannelCredentialsDto): Extract<ChannelCredentialsDto, { provider: 'evolution' }> {
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new Error('Channel provider configuration does not match its credentials.');
    return credentials;
  }

  private messageKey(recipient: string, target: QuotedMessage) {
    const remoteJid = target.remoteJid ?? recipient;
    return { remoteJid: remoteJid.includes('@') ? remoteJid : `${remoteJid}@s.whatsapp.net`, fromMe: target.fromMe, id: target.externalMessageId, participant: target.participant ?? '' };
  }

  private async post(url: string, body: unknown, headers: Record<string, string>, timeout = 15_000, context?: MessagingAdapterContext): Promise<ProviderSendResult> {
    if (!body) return { deliveryState: 'failed', externalMessageId: null };
    try { await assertPublicEvolutionTarget(url) } catch { return { deliveryState: 'failed', externalMessageId: null }; }
    let response: Response;
    try { response = await evolutionFetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), redirect: 'error' }); }
    catch { return { deliveryState: 'unknown', externalMessageId: null }; }
    if (!response.ok) {
      await this.logProviderRejection(response, url, context);
      return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    }
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const externalMessageId = result.ok ? this.readMessageId(result.payload) : null;
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private async postForm(url: string, body: FormData, headers: Record<string, string>, timeout: number, context?: MessagingAdapterContext): Promise<ProviderSendResult> {
    try { await assertPublicEvolutionTarget(url) } catch { return { deliveryState: 'failed', externalMessageId: null }; }
    let response: Response;
    try { response = await evolutionFetch(url, { method: 'POST', headers: { ...headers, accept: 'application/json' }, body, signal: AbortSignal.timeout(timeout), redirect: 'error' }); }
    catch { return { deliveryState: 'unknown', externalMessageId: null }; }
    if (!response.ok) {
      await this.logProviderRejection(response, url, context);
      return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    }
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const externalMessageId = result.ok ? this.readMessageId(result.payload) : null;
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private readMessageId(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || !('key' in payload) || typeof payload.key !== 'object' || payload.key === null || !('id' in payload.key) || typeof payload.key.id !== 'string') return null;
    return payload.key.id;
  }

  private async logProviderRejection(response: Response, url: string, context?: MessagingAdapterContext): Promise<void> {
    const result = await readLimitedJsonResponse(response, MAX_PROVIDER_RESPONSE_BYTES);
    const code = result.ok ? this.readProviderErrorCode(result.payload) : null;
    const endpoint = new URL(url).pathname.split('/').slice(-2, -1)[0] ?? 'unknown';
    this.logger.warn(JSON.stringify({
      event: 'whatsapp_provider_rejection',
      provider: this.provider,
      endpoint,
      status: response.status,
      providerErrorCode: code,
      responseParsed: result.ok,
      organizationId: context?.organizationId,
      channelId: context?.channelId,
      messageId: context?.messageId,
      correlationId: context?.correlationId,
    }));
  }

  private readProviderErrorCode(payload: unknown): string | number | null {
    if (typeof payload !== 'object' || payload === null || !('error' in payload) || typeof payload.error !== 'object' || payload.error === null || !('code' in payload.error)) return null;
    const code = payload.error.code;
    if (typeof code === 'number' && Number.isSafeInteger(code)) return code;
    return typeof code === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? code : null;
  }
}
