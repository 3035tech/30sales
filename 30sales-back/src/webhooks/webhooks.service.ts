import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { env } from '../config/env';
import { InboundMediaDto, IncomingWhatsappMessageDto, InterpretationFailureSignalDto, type InterpretationFailureSignalInputDto, type InboundMediaType, type MessageDeliveryState, type WebhookProvider, WhatsappMessageStatusDto } from './webhooks.dto';
import { WebhooksRepository } from './webhooks.repository';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class WebhooksService {
  constructor(private readonly repository: WebhooksRepository, private readonly credentialCrypto: ChannelCredentialCryptoService) {}

  verifyCloudChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    if (mode !== 'subscribe' || !challenge || !this.matchesSecret(token, env.META_WEBHOOK_VERIFY_TOKEN)) throw new UnauthorizedException();
    return challenge;
  }

  async ingestEvolution(channelId: string, presentedWebhookSecret: string | undefined, payload: unknown, rawBody: Buffer): Promise<{ accepted: true; processed: number }> {
    const channel = await this.repository.findEvolutionChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = this.credentialCrypto.decrypt(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
    if (credentials.provider !== 'evolution' || !this.matchesSecret(presentedWebhookSecret, credentials.webhookSecret)) throw new UnauthorizedException();

    const event = this.record(payload);
    const instance = this.string(event.instance);
    const eventName = this.string(event.event)?.toLowerCase().replaceAll('_', '.') ?? '';
    if (instance !== channel.providerChannelId) throw new UnauthorizedException();
    const data = Array.isArray(event.data) ? event.data : [event.data];
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let processed = 0;
    for (const item of data) {
      if (eventName === 'messages.upsert') {
        const message = this.normalizeEvolutionMessage(channel.id, channel.organizationId, item, payloadHash);
        if (message && await this.repository.recordIncomingMessage(message) === 'created') processed += 1;
      } else if (eventName === 'messages.update') {
        const status = this.normalizeEvolutionStatus(channel.id, channel.organizationId, item, payloadHash);
        if (status && await this.repository.recordMessageStatus(status) === 'updated') processed += 1;
      }
    }
    return { accepted: true, processed };
  }

  async ingestInterpretationFailure(channelId: string, webhookSecret: string | undefined, input: InterpretationFailureSignalInputDto, rawBody: Buffer): Promise<{ accepted: true; outcome: string }> {
    const channel = await this.repository.findChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = this.credentialCrypto.decrypt(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
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
        if (this.string(change.field) !== 'messages') continue;
        const value = this.record(change.value);
        const metadata = this.record(value.metadata);
        const phoneNumberId = this.string(metadata.phone_number_id);
        if (!phoneNumberId) continue;
        const channel = await this.repository.findCloudChannel(phoneNumberId);
        if (!channel?.isActive) continue;
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
          if (status && await this.repository.recordMessageStatus(status) === 'updated') processed += 1;
        }
      }
    }
    return { accepted: true, processed };
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
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'evolution', externalMessageId, `${channelId}:${senderPhone}`, senderPhone, this.string(data.pushName), messageType, this.classifyCloserSignal(bodyText), bodyText, occurredAt, payloadHash, media);
  }

  private normalizeCloudMessage(channelId: string, organizationId: string, value: unknown, contacts: JsonRecord[], payloadHash: string): IncomingWhatsappMessageDto | null {
    const message = this.record(value);
    const senderPhone = this.phoneDigits(this.string(message.from) ?? '');
    const externalMessageId = this.string(message.id);
    const messageType = (this.string(message.type) ?? 'unknown').slice(0, 80);
    if (!this.isValidPhone(senderPhone) || !externalMessageId || externalMessageId.length > 250) return null;
    const contact = contacts.find((candidate) => this.phoneDigits(this.string(candidate.wa_id) ?? '') === senderPhone);
    const profile = this.record(contact?.profile);
    const occurredAt = this.toDate(message.timestamp);
    const bodyText = this.extractCloudText(message, messageType)?.slice(0, 16000) ?? null;
    const mediaType = this.asMediaType(messageType);
    const mediaContent = mediaType ? this.record(message[mediaType]) : {};
    const mediaId = this.string(mediaContent.id);
    const media = mediaType && mediaId ? this.createMedia(channelId, organizationId, mediaType, mediaId, JSON.stringify({ mediaId }), mediaContent) : null;
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'whatsapp_cloud_api', externalMessageId, `${channelId}:${senderPhone}`, senderPhone, this.string(profile.name), messageType, this.classifyCloserSignal(bodyText), bodyText, occurredAt, payloadHash, media);
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
  private record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
  private string(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
  private matchesSecret(presented: string | undefined, expected: string | undefined): boolean {
    if (!presented || !expected) return false;
    const actual = Buffer.from(presented);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  }
}
