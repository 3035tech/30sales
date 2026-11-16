import { Injectable } from '@nestjs/common';
import { env } from '../config/env';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import { CHANNEL_PROVIDER } from '../channels/channels.constants';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import { OUTBOUND_MEDIA_MIME_TYPE, OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';
import type { ProviderSendResult } from './whatsapp-text-provider.service';

type MediaType = typeof OUTBOUND_MEDIA_TYPE[keyof typeof OUTBOUND_MEDIA_TYPE];
type MediaSendFields = { providerChannelId: string; recipientPhone: string; bodyText: string; mediaType: MediaType; mimeType: string; fileName: string; content: Buffer };
type MediaSendInput = MediaSendFields & { credentials: ChannelCredentialsDto };

@Injectable()
export class WhatsappMediaProviderService {
  async send(input: MediaSendInput): Promise<ProviderSendResult> {
    const { credentials, ...fields } = input;
    if (credentials.provider === CHANNEL_PROVIDER.evolution) {
      try { await assertPublicEvolutionTarget(credentials.baseUrl) }
      catch { return { deliveryState: 'failed', externalMessageId: null } }
      return this.sendEvolution(fields, credentials);
    }
    return this.sendCloud(fields, credentials);
  }

  private async sendEvolution(input: MediaSendFields, credentials: Extract<ChannelCredentialsDto, { provider: typeof CHANNEL_PROVIDER.evolution }>): Promise<ProviderSendResult> {
    const audio = input.mediaType === OUTBOUND_MEDIA_TYPE.audio;
    const endpoint = audio ? 'sendWhatsAppAudio' : 'sendMedia';
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/message/${endpoint}/${encodeURIComponent(input.providerChannelId)}`;
    const body = audio
      ? { number: input.recipientPhone, audio: input.content.toString('base64') }
      : { number: input.recipientPhone, mediatype: input.mediaType, mimetype: input.mimeType, caption: input.bodyText, media: input.content.toString('base64'), fileName: input.fileName };
    let response: Response;
    try { response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', apikey: credentials.apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: 'error' }) }
    catch { return { deliveryState: 'unknown', externalMessageId: null } }
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const externalMessageId = await this.readMessageId(response, CHANNEL_PROVIDER.evolution);
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private async sendCloud(input: MediaSendFields, credentials: Extract<ChannelCredentialsDto, { provider: typeof CHANNEL_PROVIDER.whatsappCloudApi }>): Promise<ProviderSendResult> {
    const baseUrl = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.providerChannelId)}`;
    let mediaResponse: Response;
    try {
      const form = new FormData();
      form.set('messaging_product', 'whatsapp');
      form.set('type', input.mimeType);
      form.set('file', new Blob([Uint8Array.from(input.content)], { type: input.mimeType }), input.fileName);
      mediaResponse = await fetch(`${baseUrl}/media`, { method: 'POST', headers: { authorization: `Bearer ${credentials.accessToken}` }, body: form, signal: AbortSignal.timeout(30_000), redirect: 'error' });
    } catch { return { deliveryState: 'unknown', externalMessageId: null } }
    if (!mediaResponse.ok) return { deliveryState: mediaResponse.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const mediaId = await this.readMediaId(mediaResponse);
    if (!mediaId) return { deliveryState: 'unknown', externalMessageId: null };
    const mediaPayload = input.mediaType === OUTBOUND_MEDIA_TYPE.document
      ? { id: mediaId, filename: input.fileName, caption: input.bodyText }
      : input.mediaType === OUTBOUND_MEDIA_TYPE.audio
        ? { id: mediaId, ...(input.mimeType === OUTBOUND_MEDIA_MIME_TYPE.oggAudio ? { voice: true } : {}) }
        : { id: mediaId, caption: input.bodyText };
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientPhone, type: input.mediaType, [input.mediaType]: mediaPayload };
    let response: Response;
    try { response = await fetch(`${baseUrl}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${credentials.accessToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: 'error' }) }
    catch { return { deliveryState: 'unknown', externalMessageId: null } }
    if (!response.ok) return { deliveryState: response.status >= 500 ? 'unknown' : 'failed', externalMessageId: null };
    const externalMessageId = await this.readMessageId(response, CHANNEL_PROVIDER.whatsappCloudApi);
    return externalMessageId ? { deliveryState: 'accepted', externalMessageId } : { deliveryState: 'unknown', externalMessageId: null };
  }

  private async readMediaId(response: Response): Promise<string | null> {
    const payload: unknown = await response.json().catch(() => null);
    if (typeof payload !== 'object' || payload === null || !('id' in payload) || typeof payload.id !== 'string') return null;
    return payload.id;
  }

  private async readMessageId(response: Response, provider: typeof CHANNEL_PROVIDER[keyof typeof CHANNEL_PROVIDER]): Promise<string | null> {
    const payload: unknown = await response.json().catch(() => null);
    if (typeof payload !== 'object' || payload === null) return null;
    if (provider === CHANNEL_PROVIDER.evolution && 'key' in payload && typeof payload.key === 'object' && payload.key !== null && 'id' in payload.key && typeof payload.key.id === 'string') return payload.key.id;
    if (provider === CHANNEL_PROVIDER.whatsappCloudApi && 'messages' in payload && Array.isArray(payload.messages)) {
      const [message] = payload.messages;
      if (typeof message === 'object' && message !== null && 'id' in message && typeof message.id === 'string') return message.id;
    }
    return null;
  }
}
