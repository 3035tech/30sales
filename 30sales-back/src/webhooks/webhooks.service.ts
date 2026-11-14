import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { env } from '../config/env';
import { IncomingWhatsappMessageDto, type WebhookProvider } from './webhooks.dto';
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
    if (eventName !== 'messages.upsert') return { accepted: true, processed: 0 };

    const data = Array.isArray(event.data) ? event.data : [event.data];
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let processed = 0;
    for (const item of data) {
      const message = this.normalizeEvolutionMessage(channel.id, channel.organizationId, item, payloadHash);
      if (!message) continue;
      if (await this.repository.recordIncomingMessage(message) === 'created') processed += 1;
    }
    return { accepted: true, processed };
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
      }
    }
    return { accepted: true, processed };
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
    const messageContent = this.record(data.message);
    const messageType = (this.string(data.messageType) ?? this.inferEvolutionMessageType(messageContent)).slice(0, 80);
    const bodyText = this.extractEvolutionText(messageContent)?.slice(0, 16000) ?? null;
    const occurredAt = this.toDate(data.messageTimestamp);
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'evolution', externalMessageId, `${channelId}:${senderPhone}`, senderPhone, this.string(data.pushName), messageType, bodyText, occurredAt, payloadHash);
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
    return new IncomingWhatsappMessageDto(organizationId, channelId, 'whatsapp_cloud_api', externalMessageId, `${channelId}:${senderPhone}`, senderPhone, this.string(profile.name), messageType, this.extractCloudText(message, messageType)?.slice(0, 16000) ?? null, occurredAt, payloadHash);
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
    const type = Object.keys(message).find((key) => key.endsWith('Message'));
    return type?.replace(/Message$/, '').toLowerCase() ?? 'unknown';
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
