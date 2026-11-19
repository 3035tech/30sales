import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { ChannelsService } from '../channels/channels.service';
import { CHANNEL_CONNECTION_STATUS } from '../channels/channels.constants';
import type { ChannelConnectionStatus } from '../channels/channels.dto';
import { env } from '../config/env';
import { EvolutionContactUpdateDto, InboundMediaDto, IncomingWhatsappMessageDto, InterpretationFailureSignalDto, ProviderWebhookEventDto, type InterpretationFailureSignalInputDto, type InboundMediaType, type MessageDeliveryState, type ProviderEventFamily, type WebhookProvider, WhatsappMessageStatusDto } from './webhooks.dto';
import { WebhooksRepository } from './webhooks.repository';
import { EVOLUTION_CONNECTION_STATE, EVOLUTION_WEBHOOK_EVENT, META_EXTERNAL_RECORD_TYPE, META_WHATSAPP_WEBHOOK_FIELD } from './provider-webhook-events.constants';

type JsonRecord = Record<string, unknown>;
const knownEvolutionEvents: ReadonlySet<string> = new Set(Object.values(EVOLUTION_WEBHOOK_EVENT));

@Injectable()
export class WebhooksService {
  constructor(private readonly repository: WebhooksRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly credentialResolver: ChannelCredentialResolverService, private readonly channelsService: ChannelsService) {}

  verifyCloudChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    if (mode !== 'subscribe' || !challenge || !this.matchesSecret(token, env.META_WEBHOOK_VERIFY_TOKEN)) throw new UnauthorizedException();
    return challenge;
  }

  async ingestEvolution(channelId: string, presentedWebhookSecret: string | undefined, payload: unknown, rawBody: Buffer): Promise<{ accepted: true; processed: number }> {
    const channel = await this.repository.findEvolutionChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = await this.credentialResolver.resolve(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
    if (credentials.provider !== 'evolution' || !this.matchesSecret(presentedWebhookSecret, credentials.webhookSecret)) throw new UnauthorizedException();

    const event = this.record(payload);
    const instance = this.string(event.instance);
    const eventName = this.string(event.event)?.toLowerCase().replaceAll('_', '.') ?? '';
    if (instance !== channel.providerChannelId) throw new UnauthorizedException();
    const isSnapshotEvent = eventName === EVOLUTION_WEBHOOK_EVENT.messagesSet || eventName === EVOLUTION_WEBHOOK_EVENT.contactsSet || eventName === EVOLUTION_WEBHOOK_EVENT.chatsSet;
    const data = isSnapshotEvent ? [event.data] : Array.isArray(event.data) ? event.data : [event.data];
    if (eventName === EVOLUTION_WEBHOOK_EVENT.connectionUpdate) {
      const connectionEvent = this.record(data[0]);
      const rawState = this.string(connectionEvent.state) ?? this.string(connectionEvent.status);
      if (rawState) await this.channelsService.recordEvolutionConnectionStatus(channel.organizationId, channel.id, this.toEvolutionConnectionStatus(rawState));
    }
    if (eventName === EVOLUTION_WEBHOOK_EVENT.logoutInstance || eventName === EVOLUTION_WEBHOOK_EVENT.removeInstance) {
      await this.channelsService.recordEvolutionConnectionStatus(channel.organizationId, channel.id, CHANNEL_CONNECTION_STATUS.disconnected);
    }
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let processed = 0;
    for (const item of data) {
      if (eventName === EVOLUTION_WEBHOOK_EVENT.messagesUpsert) {
        const message = this.normalizeEvolutionMessage(channel.id, channel.organizationId, item, payloadHash);
        if (message && await this.repository.recordIncomingMessage(message) === 'created') processed += 1;
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.messagesUpdate) {
        const status = this.normalizeEvolutionStatus(channel.id, channel.organizationId, item, payloadHash);
        if (status) {
          const result = await this.repository.recordMessageStatus(status);
          if (result === 'updated') processed += 1;
          if (result === 'unmatched') processed += await this.recordUnmatchedStatus(channel.id, channel.organizationId, 'evolution', status);
        }
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.contactsUpsert || eventName === EVOLUTION_WEBHOOK_EVENT.contactsUpdate) {
        const contact = this.record(item);
        const jid = [contact.remoteJid, contact.remoteJidAlt, contact.id, contact.jid]
          .map((candidate) => this.string(candidate))
          .find((candidate) => candidate !== null && (!candidate.includes('@') || candidate.endsWith('@s.whatsapp.net') || candidate.endsWith('@c.us')));
        const phoneDigits = jid ? this.phoneDigits(jid) : '';
        if (this.isValidPhone(phoneDigits)) {
          const displayName = (this.string(contact.pushName)?.trim() || this.string(contact.name)?.trim() || this.string(contact.verifiedName)?.trim() || '').slice(0, 160) || null;
          const fingerprint = createHash('sha256').update(JSON.stringify(item) ?? '').digest('hex');
          const eventId = createHash('sha256').update(`${channel.id}:contacts:${phoneDigits}:${fingerprint}`).digest('hex');
          const result = await this.repository.updateKnownEvolutionContact(new EvolutionContactUpdateDto(channel.organizationId, channel.id, eventId, phoneDigits, displayName, fingerprint));
          if (result === 'updated') processed += 1;
        }
      } else {
        const safeEventName = eventName.replace(/[^a-z0-9._-]/g, '_').slice(0, 120);
        const normalizedEventName = this.isKnownEvolutionEvent(safeEventName) ? safeEventName : `unknown.${safeEventName || 'event'}`;
        const fingerprint = createHash('sha256').update(JSON.stringify(item) ?? '').digest('hex');
        const eventId = createHash('sha256').update(`${channel.id}:${normalizedEventName}:${fingerprint}`).digest('hex');
        const eventDto = new ProviderWebhookEventDto(channel.organizationId, channel.id, 'evolution', eventId, `evolution.${normalizedEventName}`, this.evolutionEventFamily(normalizedEventName), fingerprint);
        if (await this.repository.recordProviderEvent(eventDto) === 'created') processed += 1;
      }
    }
    return { accepted: true, processed };
  }

  async ingestInterpretationFailure(channelId: string, webhookSecret: string | undefined, input: InterpretationFailureSignalInputDto, rawBody: Buffer): Promise<{ accepted: true; outcome: string }> {
    const channel = await this.repository.findChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = await this.credentialResolver.resolve(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
    const signalSecret = credentials.provider === 'evolution' ? credentials.webhookSecret : credentials.signalSecret;
    if (!this.matchesSecret(webhookSecret, signalSecret)) throw new UnauthorizedException();
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const outcome = await this.repository.recordInterpretationFailure(new InterpretationFailureSignalDto(channel.organizationId, channel.id, credentials.provider, input, payloadHash));
    return { accepted: true, outcome };
  }

  async recordRuntimeInterpretationFailure(input: {
    organizationId: string;
    channelId: string;
    provider: 'evolution' | 'whatsapp_cloud_api';
    externalConversationId: string;
    externalMessageId: string;
    reason: string;
  }): Promise<void> {
    const payloadHash = createHash('sha256').update(`${input.organizationId}:${input.channelId}:${input.externalMessageId}:${input.reason}`).digest('hex');
    await this.repository.recordInterpretationFailure(new InterpretationFailureSignalDto(
      input.organizationId,
      input.channelId,
      input.provider,
      { externalConversationId: input.externalConversationId, externalMessageId: input.externalMessageId, reason: input.reason },
      payloadHash,
    ));
  }

  async ingestCloud(signature: string | undefined, payload: unknown, rawBody: Buffer): Promise<{ accepted: true; processed: number }> {
    this.assertCloudSignature(signature, rawBody);
    const root = this.record(payload);
    const entries = Array.isArray(root.entry) ? root.entry : [];
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let processed = 0;
    for (const entryValue of entries) {
      const entry = this.record(entryValue);
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const changeValue of changes) {
        const change = this.record(changeValue);
        const field = (this.string(change.field)?.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120)) || 'unknown';
        const value = this.record(change.value);
        const metadata = this.record(value.metadata);
        const phoneNumberId = this.string(metadata.phone_number_id) ?? this.string(value.phone_number_id);
        const channel = phoneNumberId
          ? await this.repository.findCloudChannel(phoneNumberId)
          : await this.repository.findCloudAccountChannel(this.string(entry.id) ?? '');
        if (!channel?.isActive) continue;
        if (field !== META_WHATSAPP_WEBHOOK_FIELD.messages) {
          const fingerprint = createHash('sha256').update(JSON.stringify(changeValue) ?? '').digest('hex');
          const eventId = createHash('sha256').update(`${channel.id}:${field}:${fingerprint}`).digest('hex');
          const eventDto = new ProviderWebhookEventDto(channel.organizationId, channel.id, 'whatsapp_cloud_api', eventId, `meta.${field}`, this.metaEventFamily(field), fingerprint);
          if (await this.repository.recordProviderEvent(eventDto) === 'created') processed += 1;
          continue;
        }
        if (!phoneNumberId) continue;
        const contacts = Array.isArray(value.contacts) ? value.contacts.map((contact) => this.record(contact)) : [];
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const messageValue of messages) {
          const message = this.normalizeCloudMessage(channel.id, channel.organizationId, messageValue, contacts, payloadHash);
          if (!message) continue;
          if (await this.repository.recordIncomingMessage(message) === 'created') processed += 1;
        }
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const statusValue of statuses) {
          const status = this.normalizeCloudStatus(channel.id, channel.organizationId, statusValue, payloadHash);
          if (status) {
            const result = await this.repository.recordMessageStatus(status);
            if (result === 'updated') processed += 1;
            if (result === 'unmatched') processed += await this.recordUnmatchedStatus(channel.id, channel.organizationId, 'whatsapp_cloud_api', status);
          }
        }
      }
    }
    return { accepted: true, processed };
  }

  private async recordUnmatchedStatus(channelId: string, organizationId: string, provider: WebhookProvider, status: WhatsappMessageStatusDto): Promise<number> {
    const event = new ProviderWebhookEventDto(organizationId, channelId, provider, `unmatched:${status.externalEventId}`, 'messages.status.unmatched', 'message', status.payloadHash);
    return await this.repository.recordProviderEvent(event) === 'created' ? 1 : 0;
  }

  private isKnownEvolutionEvent(eventName: string): boolean {
    return knownEvolutionEvents.has(eventName);
  }

  private toEvolutionConnectionStatus(state: string): ChannelConnectionStatus {
    const normalized = state.trim().toLowerCase();
    if (normalized === EVOLUTION_CONNECTION_STATE.open || normalized === EVOLUTION_CONNECTION_STATE.connected) return CHANNEL_CONNECTION_STATUS.connected;
    if (normalized === EVOLUTION_CONNECTION_STATE.connecting || normalized === EVOLUTION_CONNECTION_STATE.reconnecting) return CHANNEL_CONNECTION_STATUS.connecting;
    if (normalized === EVOLUTION_CONNECTION_STATE.close || normalized === EVOLUTION_CONNECTION_STATE.closed || normalized === EVOLUTION_CONNECTION_STATE.disconnected || normalized === EVOLUTION_CONNECTION_STATE.disconnecting) return CHANNEL_CONNECTION_STATUS.disconnected;
    return CHANNEL_CONNECTION_STATUS.unknown;
  }

  private evolutionEventFamily(eventName: string): ProviderEventFamily {
    if (eventName.startsWith('application.') || eventName.startsWith('qrcode.') || eventName.startsWith('connection.') || eventName === EVOLUTION_WEBHOOK_EVENT.logoutInstance || eventName === EVOLUTION_WEBHOOK_EVENT.removeInstance || eventName === EVOLUTION_WEBHOOK_EVENT.newToken) return 'channel';
    if (eventName.startsWith('messages.') || eventName.startsWith('send.message')) return 'message';
    if (eventName.startsWith('contacts.')) return 'contact';
    if (eventName.startsWith('presence.')) return 'presence';
    if (eventName.startsWith('chats.')) return 'chat';
    if (eventName.startsWith('groups.') || eventName.startsWith('group.')) return 'group';
    if (eventName === EVOLUTION_WEBHOOK_EVENT.call) return 'call';
    return 'other';
  }

  private metaEventFamily(field: string): ProviderEventFamily {
    if (field === META_WHATSAPP_WEBHOOK_FIELD.messages) return 'message';
    if (field.includes('template')) return 'template';
    if (field.includes('security')) return 'security';
    if (field === META_WHATSAPP_WEBHOOK_FIELD.calls) return 'call';
    if (field === META_WHATSAPP_WEBHOOK_FIELD.history || field === META_WHATSAPP_WEBHOOK_FIELD.smbAppStateSync) return 'sync';
    if (field.includes('account') || field.includes('phone_number') || field.includes('business_capability')) return 'account';
    return 'other';
  }

  private normalizeEvolutionStatus(channelId: string, organizationId: string, value: unknown, payloadHash: string): WhatsappMessageStatusDto | null {
    const data = this.record(value);
    const key = this.record(data.key);
    const externalMessageId = this.string(data.keyId) ?? this.string(key.id);
    const update = this.record(data.update);
    const rawStatus = update.status ?? data.status;
    const deliveryState = this.mapEvolutionStatus(rawStatus);
    if (!externalMessageId || externalMessageId.length > 250 || !deliveryState) return null;
    const occurredAt = this.toDate(update.timestamp ?? data.messageTimestamp ?? data.timestamp);
    const eventVersion = update.timestamp ?? data.messageTimestamp ?? data.timestamp;
    const externalEventId = this.statusEventId(channelId, externalMessageId, deliveryState, eventVersion, payloadHash);
    return new WhatsappMessageStatusDto(organizationId, channelId, 'evolution', externalMessageId, externalEventId, deliveryState, occurredAt, payloadHash);
  }

  private normalizeCloudStatus(channelId: string, organizationId: string, value: unknown, payloadHash: string): WhatsappMessageStatusDto | null {
    const status = this.record(value);
    const externalMessageId = this.string(status.id);
    const deliveryState = this.mapCloudStatus(this.string(status.status));
    if (!externalMessageId || externalMessageId.length > 250 || !deliveryState) return null;
    const occurredAt = this.toDate(status.timestamp);
    const externalEventId = this.statusEventId(channelId, externalMessageId, deliveryState, status.timestamp, payloadHash);
    return new WhatsappMessageStatusDto(organizationId, channelId, 'whatsapp_cloud_api', externalMessageId, externalEventId, deliveryState, occurredAt, payloadHash);
  }

  private statusEventId(channelId: string, messageId: string, state: MessageDeliveryState, providerTimestamp: unknown, payloadHash: string): string {
    const eventVersion = typeof providerTimestamp === 'string' || typeof providerTimestamp === 'number' ? String(providerTimestamp) : payloadHash;
    return createHash('sha256').update(`${channelId}:${messageId}:${state}:${eventVersion}`).digest('hex');
  }

  private mapCloudStatus(status: string | null): MessageDeliveryState | null {
    if (status === 'sent') return 'accepted';
    if (status === 'delivered') return 'delivered';
    if (status === 'read') return 'read';
    if (status === 'failed') return 'failed';
    return null;
  }

  private mapEvolutionStatus(status: unknown): MessageDeliveryState | null {
    if (typeof status === 'number') {
      if (status === 0) return 'failed';
      if (status === 1 || status === 2) return 'accepted';
      if (status === 3) return 'delivered';
      if (status === 4 || status === 5) return 'read';
      return null;
    }
    if (typeof status !== 'string') return null;
    const normalized = status.toUpperCase();
    if (normalized === 'ERROR' || normalized === 'FAILED') return 'failed';
    if (normalized === 'PENDING' || normalized === 'SERVER_ACK' || normalized === 'SENT') return 'accepted';
    if (normalized === 'DELIVERY_ACK' || normalized === 'DELIVERED') return 'delivered';
    if (normalized === 'READ' || normalized === 'PLAYED') return 'read';
    return null;
  }

  private assertCloudSignature(signature: string | undefined, rawBody: Buffer): void {
    if (!env.META_APP_SECRET || !signature?.startsWith('sha256=')) throw new UnauthorizedException();
    const expected = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest();
    const suppliedHex = signature.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) throw new UnauthorizedException();
    const supplied = Buffer.from(suppliedHex, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new UnauthorizedException();
  }

  private normalizeEvolutionMessage(channelId: string, organizationId: string, value: unknown, payloadHash: string): IncomingWhatsappMessageDto | null {
    const data = this.record(value);
    const key = this.record(data.key);
    if (key.fromMe === true) return null;
    const remoteJid = this.string(key.remoteJid) ?? this.string(data.remoteJid);
    if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return null;
    const altJid = this.string(key.remoteJidAlt) ?? this.string(data.remoteJidAlt);
    if (remoteJid.includes('@lid') && !altJid) return null;
    const selectedJid = altJid?.endsWith('@s.whatsapp.net') || altJid?.endsWith('@c.us') ? altJid : remoteJid;
    const senderPhone = this.phoneDigits(selectedJid);
    const externalMessageId = this.string(key.id);
    if (!this.isValidPhone(senderPhone) || !externalMessageId || externalMessageId.length > 250) return null;
    const messageContent = this.unwrapEvolutionMessage(this.record(data.message));
    const rawMessageType = this.string(data.messageType) ?? this.inferEvolutionMessageType(messageContent);
    const messageType = (['conversation', 'extendedtextmessage', 'textmessage'].includes(rawMessageType.toLowerCase()) ? 'text' : rawMessageType).slice(0, 80);
    const bodyText = this.extractEvolutionText(messageContent)?.slice(0, 16000) ?? null;
    const mediaType = this.asMediaType(rawMessageType);
    const mediaContent = mediaType ? this.record(messageContent[`${mediaType}Message`]) : {};
    const media = mediaType ? this.createMedia(channelId, organizationId, mediaType, null, JSON.stringify({ key, message: data.message }), mediaContent) : null;
    const occurredAt = this.toDate(data.messageTimestamp);
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'evolution', externalMessageId, `${channelId}:${senderPhone}`, senderPhone, null, this.string(data.pushName), messageType, this.classifyCloserSignal(bodyText), bodyText, occurredAt, payloadHash, media);
  }

  private normalizeCloudMessage(channelId: string, organizationId: string, value: unknown, contacts: JsonRecord[], payloadHash: string): IncomingWhatsappMessageDto | null {
    const message = this.record(value);
    let senderPhone = this.phoneDigits(this.string(message.from) ?? '');
    const rawSenderId = this.string(message.user_id) ?? this.string(message.from_user_id);
    let senderExternalId = this.normalizeExternalIdentity(rawSenderId);
    let contact = contacts.find((candidate) => (this.isValidPhone(senderPhone) && this.phoneDigits(this.string(candidate.wa_id) ?? '') === senderPhone)
      || (senderExternalId !== null && this.normalizeExternalIdentity(this.string(candidate.user_id)) === senderExternalId));
    if (!senderExternalId) senderExternalId = this.normalizeExternalIdentity(this.string(contact?.user_id));
    if (!this.isValidPhone(senderPhone)) senderPhone = this.phoneDigits(this.string(contact?.wa_id) ?? '');
    if (!this.isValidPhone(senderPhone)) senderPhone = '';
    const externalMessageId = this.string(message.id);
    const messageType = (this.string(message.type) ?? 'unknown').slice(0, 80);
    if ((!senderPhone && !senderExternalId) || !externalMessageId || externalMessageId.length > 250) return null;
    if (!contact && senderExternalId) contact = contacts.find((candidate) => this.normalizeExternalIdentity(this.string(candidate.user_id)) === senderExternalId);
    const profile = this.record(contact?.profile);
    const occurredAt = this.toDate(message.timestamp);
    const bodyText = this.extractCloudText(message, messageType)?.slice(0, 16000) ?? null;
    const mediaType = this.asMediaType(messageType);
    const mediaContent = mediaType ? this.record(message[mediaType]) : {};
    const mediaId = this.string(mediaContent.id);
    const media = mediaType && mediaId ? this.createMedia(channelId, organizationId, mediaType, mediaId, JSON.stringify({ mediaId }), mediaContent) : null;
    const externalConversationId = senderExternalId ? `${channelId}:${META_EXTERNAL_RECORD_TYPE.businessScopedUserId}:${senderExternalId}` : `${channelId}:${senderPhone}`;
    const senderName = this.string(profile.name)?.trim().slice(0, 160) || senderExternalId;
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'whatsapp_cloud_api', externalMessageId, externalConversationId, senderPhone || null, senderExternalId, senderName, messageType, this.classifyCloserSignal(bodyText), bodyText, occurredAt, payloadHash, media);
  }

  private createMedia(channelId: string, organizationId: string, mediaType: InboundMediaType, sourceMediaId: string | null, sourcePayload: string, mediaContent: JsonRecord): InboundMediaDto {
    const encrypted = this.credentialCrypto.encryptPayload(organizationId, channelId, sourcePayload);
    const rawSize = mediaContent.file_size ?? mediaContent.fileLength;
    const parsedSize = typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' ? Number(rawSize) : NaN;
    const sizeBytes = Number.isSafeInteger(parsedSize) && parsedSize >= 0 && parsedSize <= 1_073_741_824 ? parsedSize : null;
    const rawHash = this.string(mediaContent.sha256) ?? this.string(mediaContent.fileSha256);
    const rawMimeType = this.string(mediaContent.mime_type) ?? this.string(mediaContent.mimetype);
    const rawFileName = this.string(mediaContent.filename) ?? this.string(mediaContent.fileName);
    return new InboundMediaDto(mediaType, sourceMediaId, encrypted.ciphertext, encrypted.iv, encrypted.authTag,
      rawMimeType && rawMimeType.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(rawMimeType) ? rawMimeType : null,
      rawFileName ? rawFileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 255) : null,
      sizeBytes, rawHash?.slice(0, 128) ?? null);
  }

  private asMediaType(value: string): InboundMediaType | null {
    const normalized = value.toLowerCase().replace(/message$/, '');
    if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'document' || normalized === 'sticker') return normalized;
    return null;
  }

  private classifyCloserSignal(bodyText: string | null): 'human_requested' | 'buying_intent' | 'question' | null {
    if (!bodyText?.trim()) return null;
    const normalized = bodyText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    const humanRequest = /\b(quero|queria|gostaria|preciso|posso|pode|tem como|me transfere|me passe|me passa|me coloca|me direcione|me chama|chame|i want|i'd like|i need|can i|could i|transfer me|connect me|put me through)\b.{0,80}\b(atendente|atendimento humano|humano|pessoa(?: real| de verdade)?|alguem(?: da equipe| de verdade)?|especialista|someone|a person|human|an agent|a representative|a specialist)\b/;
    if (humanRequest.test(normalized)) return 'human_requested';
    const buyingIntent = /\b(quero|queria|gostaria de|vamos|podemos|pode|poderia|tenho interesse em|tenho interesse|me envia|envie|manda|mandar|preciso de|quero receber)\b.{0,60}\b(agendar|marcar|reuniao|demonstracao|demo|apresentacao|conhecer|contratar|comecar|iniciar|testar|proposta|orcamento|contrato|seguir|avancar|fechar)\b/;
    const negatedIntent = /\b(nao|nunca|talvez|quem sabe|sem interesse)\b.{0,45}\b(agendar|marcar|reuniao|demonstracao|demo|apresentacao|contratar|comecar|iniciar|testar|proposta|orcamento|contrato|seguir|avancar|fechar)\b/;
    const clauses = normalized.split(/[.!?;\n]+/);
    if (clauses.some((clause) => buyingIntent.test(clause) && !negatedIntent.test(clause))) return 'buying_intent';
    const greetingQuestion = /^(oi|ola|bom dia|boa tarde|boa noite)?\s*(tudo bem|tudo bom|como vai|como voce esta)[!.?\s]*$/;
    if (greetingQuestion.test(normalized)) return null;
    if (/[?？]/.test(normalized) || /^(como|qual|quais|quanto|quantos|quantas|quando|onde|por que|porque|quem|sera que|tem como|da para|what|how|which|who|when|where|why|can|could|does|do|is|are|will)\b/.test(normalized) || /\b(me explica|pode explicar|queria saber|gostaria de saber|me fala|me diz|sabe dizer|quero saber|preciso entender|como funciona|quanto custa|qual e o valor|qual o valor)\b/.test(normalized)) return 'question';
    return null;
  }

  private extractEvolutionText(message: JsonRecord): string | null {
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      const nested = this.record(message[key]);
      if (Object.keys(nested).length > 0) {
        const unwrapped = this.record(nested.message);
        if (Object.keys(unwrapped).length > 0) return this.extractEvolutionText(unwrapped);
      }
    }
    const direct = this.string(message.conversation) ?? this.string(this.record(message.extendedTextMessage).text);
    if (direct) return direct;
    for (const key of ['imageMessage', 'videoMessage', 'documentMessage']) {
      const nested = this.record(message[key]);
      const caption = this.string(nested.caption) ?? this.string(this.record(nested.message).documentMessage && this.record(this.record(nested.message).documentMessage).caption);
      if (caption) return caption;
    }
    for (const key of ['buttonsResponseMessage', 'templateButtonReplyMessage']) {
      const nested = this.record(message[key]);
      const text = this.string(nested.selectedDisplayText) ?? this.string(nested.selectedButtonId);
      if (text) return text;
    }
    const listReply = this.record(this.record(message.listResponseMessage).singleSelectReply);
    return this.string(listReply.title) ?? this.string(this.record(message.listResponseMessage).title);
  }

  private extractCloudText(message: JsonRecord, type: string): string | null {
    if (type === 'text') return this.string(this.record(message.text).body);
    if (['image', 'video', 'document'].includes(type)) return this.string(this.record(message[type]).caption);
    if (type === 'button') return this.string(this.record(message.button).text);
    if (type === 'interactive') {
      const interactive = this.record(message.interactive);
      return this.string(this.record(interactive.button_reply).title) ?? this.string(this.record(interactive.list_reply).title);
    }
    if (type === 'location') {
      const location = this.record(message.location);
      return this.string(location.name) ?? this.string(location.address);
    }
    return null;
  }

  private inferEvolutionMessageType(message: JsonRecord): string {
    const content = this.unwrapEvolutionMessage(message);
    if (typeof content.conversation === 'string' || typeof content.extendedTextMessage === 'object') return 'text';
    const type = Object.keys(content).find((key) => key.endsWith('Message'));
    return type?.replace(/Message$/, '').toLowerCase() ?? 'unknown';
  }

  private unwrapEvolutionMessage(message: JsonRecord): JsonRecord {
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      const nested = this.record(message[key]);
      const unwrapped = this.record(nested.message);
      if (Object.keys(unwrapped).length > 0) return this.unwrapEvolutionMessage(unwrapped);
    }
    return message;
  }

  private toDate(value: unknown): Date {
    const timestamp = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp) : new Date();
  }

  private phoneDigits(value: string): string { return value.split('@')[0].split(':')[0].replace(/\D/g, ''); }
  private isValidPhone(value: string): boolean { return value.length >= 8 && value.length <= 15 && value[0] !== '0'; }

  private normalizeExternalIdentity(value: string | null): string | null {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 && normalized.length <= 250 && /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : null;
  }
  private record(value: unknown): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) record[key] = entry;
    return record;
  }
  private string(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
  private matchesSecret(presented: string | undefined, expected: string | undefined): boolean {
    if (!presented || !expected) return false;
    const actual = Buffer.from(presented);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  }
}
