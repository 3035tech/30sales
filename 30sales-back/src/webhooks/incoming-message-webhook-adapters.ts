import { Injectable } from '@nestjs/common';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { META_EXTERNAL_RECORD_TYPE } from './provider-webhook-events.constants';
import { InboundMediaDto, IncomingWhatsappMessageDto, type EvolutionMessageMetadata, type InboundMediaType } from './webhooks.dto';

type JsonRecord = Record<string, unknown>;
type CloserSignal = 'human_requested' | 'buying_intent' | 'question' | null;
type NormalizeInput = { readonly channelId: string; readonly organizationId: string; readonly value: unknown; readonly payloadHash: string; readonly classifyCloserSignal: (bodyText: string | null) => CloserSignal };
export interface IncomingMessageWebhookAdapter {
  readonly provider: 'evolution' | 'whatsapp_cloud_api';
  normalize(input: NormalizeInput & { readonly contacts?: ReadonlyArray<JsonRecord> }): IncomingWhatsappMessageDto | null;
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) result[key] = entry;
  return result;
}

function string(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
function toDate(value: unknown): Date {
  const timestamp = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp) : new Date();
}
function phoneDigits(value: string): string { return value.split('@')[0].split(':')[0].replace(/\D/g, ''); }
function isValidPhone(value: string): boolean { return value.length >= 8 && value.length <= 15 && value[0] !== '0'; }
function asMediaType(value: string): InboundMediaType | null {
  const normalized = value.toLowerCase().replace(/message$/, '');
  return normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'document' || normalized === 'sticker' ? normalized : null;
}
function normalizeExternalIdentity(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 && normalized.length <= 250 && /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : null;
}

@Injectable()
export class EvolutionIncomingMessageWebhookAdapter implements IncomingMessageWebhookAdapter {
  readonly provider = 'evolution' as const;
  constructor(private readonly credentialCrypto: ChannelCredentialCryptoService) {}

  normalize(input: NormalizeInput): IncomingWhatsappMessageDto | null {
    const data = record(input.value);
    const key = record(data.key);
    if (key.fromMe === true) return null;
    const remoteJid = string(key.remoteJid) ?? string(data.remoteJid);
    if (!remoteJid || remoteJid === 'status@broadcast') return null;
    const isGroup = remoteJid.endsWith('@g.us');
    if (isGroup && remoteJid.length > 250) return null;
    const altJid = string(key.remoteJidAlt) ?? string(data.remoteJidAlt);
    const participantJid = string(key.participantAlt) ?? string(data.participantAlt) ?? string(key.participant) ?? string(data.participant);
    if (!isGroup && remoteJid.includes('@lid') && !altJid) return null;
    const selectedJid = isGroup
      ? (participantJid?.endsWith('@s.whatsapp.net') || participantJid?.endsWith('@c.us') ? participantJid : '')
      : (altJid?.endsWith('@s.whatsapp.net') || altJid?.endsWith('@c.us') ? altJid : remoteJid);
    const senderPhone = phoneDigits(selectedJid.split('@')[0].split(':')[0]);
    const externalMessageId = string(key.id);
    if ((!isGroup && !isValidPhone(senderPhone)) || !externalMessageId || externalMessageId.length > 250) return null;
    const messageContent = this.unwrap(record(data.message));
    const rawMessageType = string(data.messageType) ?? this.inferType(messageContent);
    const messageType = (['conversation', 'extendedtextmessage', 'textmessage'].includes(rawMessageType.toLowerCase()) ? 'text' : rawMessageType).slice(0, 80);
    const reaction = this.extractReaction(messageContent);
    const quotedMessage = this.extractQuotedMessage(messageContent);
    const richContent = this.extractRichContent(messageContent);
    const bodyText = (reaction?.emoji ?? (richContent?.kind === 'poll' ? richContent.title : richContent?.kind === 'card' ? [richContent.title, richContent.body].filter(Boolean).join('\n') : null) ?? this.extractText(messageContent))?.slice(0, 16000) ?? null;
    const authorName = string(data.pushName)?.trim().slice(0, 160) || null;
    const evolutionMetadata: EvolutionMessageMetadata | null = reaction || quotedMessage || richContent || isGroup
      ? { reaction, quotedMessage, richContent, ...(isGroup ? { author: { name: authorName, phone: isValidPhone(senderPhone) ? senderPhone : null } } : {}) }
      : null;
    const directMediaType = asMediaType(rawMessageType);
    const cardTemplate = this.templateContent(messageContent);
    const cardImage = record(cardTemplate.imageMessage);
    const mediaType = directMediaType ?? (Object.keys(cardImage).length ? 'image' : null);
    const mediaContent = mediaType ? record(messageContent[`${mediaType}Message`]) : {};
    const resolvedMediaContent = Object.keys(mediaContent).length ? mediaContent : cardImage;
    const media = mediaType ? this.createMedia(input.channelId, input.organizationId, mediaType, null, JSON.stringify({ key, message: data.message }), resolvedMediaContent) : null;
    const occurredAt = toDate(data.messageTimestamp);
    const groupName = string(data.groupName) ?? string(data.subject);
    return new IncomingWhatsappMessageDto(input.organizationId, input.channelId, this.provider, externalMessageId, `${input.channelId}:${isGroup ? remoteJid : senderPhone}`, isGroup ? (isValidPhone(senderPhone) ? senderPhone : null) : senderPhone, null, authorName, messageType, isGroup ? null : input.classifyCloserSignal(bodyText), bodyText, occurredAt, input.payloadHash, media, evolutionMetadata, isGroup ? 'group' : 'direct', isGroup ? groupName?.trim().slice(0, 160) || remoteJid : null, isGroup ? remoteJid : null);
  }

  extractText(value: JsonRecord): string | null { return this.extractTextInternal(value); }
  unwrap(value: JsonRecord): JsonRecord {
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      const nested = record(value[key]);
      const unwrapped = record(nested.message);
      if (Object.keys(unwrapped).length > 0) return this.unwrap(unwrapped);
    }
    return value;
  }

  private createMedia(channelId: string, organizationId: string, mediaType: InboundMediaType, sourceMediaId: string | null, sourcePayload: string, mediaContent: JsonRecord): InboundMediaDto {
    const encrypted = this.credentialCrypto.encryptPayload(organizationId, channelId, sourcePayload);
    const rawSize = mediaContent.file_size ?? mediaContent.fileLength;
    const parsedSize = typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' ? Number(rawSize) : NaN;
    const sizeBytes = Number.isSafeInteger(parsedSize) && parsedSize >= 0 && parsedSize <= 1_073_741_824 ? parsedSize : null;
    const rawHash = string(mediaContent.sha256) ?? string(mediaContent.fileSha256);
    const rawMimeType = string(mediaContent.mime_type) ?? string(mediaContent.mimetype);
    const rawFileName = string(mediaContent.filename) ?? string(mediaContent.fileName);
    return new InboundMediaDto(mediaType, sourceMediaId, encrypted.ciphertext, encrypted.iv, encrypted.authTag,
      rawMimeType && rawMimeType.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(rawMimeType) ? rawMimeType : null,
      rawFileName ? rawFileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 255) : null, sizeBytes, rawHash?.slice(0, 128) ?? null);
  }
  private inferType(message: JsonRecord): string {
    const content = this.unwrap(message);
    if (typeof content.conversation === 'string' || typeof content.extendedTextMessage === 'object') return 'text';
    return Object.keys(content).find((key) => key.endsWith('Message'))?.replace(/Message$/, '').toLowerCase() ?? 'unknown';
  }
  private extractTextInternal(message: JsonRecord): string | null {
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
      const nested = record(message[key]); const unwrapped = record(nested.message);
      if (Object.keys(unwrapped).length > 0) return this.extractTextInternal(unwrapped);
    }
    const direct = string(message.conversation) ?? string(record(message.extendedTextMessage).text);
    if (direct) return direct;
    const location = record(message.locationMessage);
    const latitude = typeof location.degreesLatitude === 'number' ? String(location.degreesLatitude) : null;
    const longitude = typeof location.degreesLongitude === 'number' ? String(location.degreesLongitude) : null;
    const address = string(location.address) ?? string(location.name);
    if (latitude && longitude) return [address, `${latitude}, ${longitude}`].filter(Boolean).join(' · ');
    const contact = record(message.contactMessage); const vcard = string(contact.vcard);
    if (vcard) return [string(contact.displayName), ...vcard.split(/\r?\n/).filter((line) => /^TEL(?:;[^:]*)?:/i.test(line)).map((line) => line.slice(line.indexOf(':') + 1))].filter(Boolean).join(' · ');
    const contacts = record(message.contactsArrayMessage);
    const contactList = Array.isArray(contacts.contacts) ? contacts.contacts.map((entry) => string(record(entry).displayName)).filter((name): name is string => Boolean(name)) : [];
    if (contactList.length) return contactList.join(', ');
    for (const key of ['imageMessage', 'videoMessage', 'documentMessage']) {
      const nested = record(message[key]); const document = record(record(nested.message).documentMessage);
      const caption = string(nested.caption) ?? string(document.caption);
      if (caption) return caption;
    }
    for (const key of ['buttonsResponseMessage', 'templateButtonReplyMessage']) {
      const nested = record(message[key]); const text = string(nested.selectedDisplayText) ?? string(nested.selectedButtonId);
      if (text) return text;
    }
    const listResponse = record(message.listResponseMessage);
    return string(record(listResponse.singleSelectReply).title) ?? string(listResponse.title);
  }
  private extractReaction(message: JsonRecord): { targetExternalMessageId: string; emoji: string } | null {
    const reaction = record(message.reactionMessage); const targetExternalMessageId = string(record(reaction.key).id); const emoji = string(reaction.text)?.trim();
    return targetExternalMessageId && targetExternalMessageId.length <= 250 && emoji && [...emoji].length <= 32 ? { targetExternalMessageId, emoji } : null;
  }
  private extractQuotedMessage(message: JsonRecord): EvolutionMessageMetadata['quotedMessage'] {
    const contentKeys = ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage'];
    const messageContext = contentKeys.map((key) => record(record(message[key]).contextInfo)).find((context) => Object.keys(record(context.quotedMessage)).length > 0) ?? record(message.contextInfo);
    const quoted = record(messageContext.quotedMessage); if (!Object.keys(quoted).length) return null;
    const externalMessageId = string(messageContext.stanzaId); const bodyText = this.extractTextInternal(quoted)?.trim().slice(0, 2000) ?? null;
    if (!externalMessageId && !bodyText) return null;
    return { externalMessageId: externalMessageId && externalMessageId.length <= 250 ? externalMessageId : null, bodyText };
  }
  private extractRichContent(message: JsonRecord): EvolutionMessageMetadata['richContent'] {
    for (const key of ['pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3']) {
      const poll = record(message[key]); const title = string(poll.name)?.trim().slice(0, 4096); if (!title) continue;
      const options = Array.isArray(poll.options) ? poll.options.slice(0, 20).map((option) => string(record(option).optionName)?.trim().slice(0, 200) ?? '').filter(Boolean) : [];
      return { kind: 'poll', title, options };
    }
    const template = this.templateContent(message);
    if (Object.keys(template).length) {
      const title = (string(template.hydratedTitleText) ?? string(template.title) ?? '').trim().slice(0, 500) || null;
      const body = (string(template.hydratedContentText) ?? string(template.content) ?? '').trim().slice(0, 4096) || null;
      const buttons = Array.isArray(template.hydratedButtons) ? template.hydratedButtons.slice(0, 4).map(record) : [];
      const urlButton = buttons.map((button) => record(button.urlButton)).find((candidate) => Object.keys(candidate).length > 0);
      const buttonLabel = string(urlButton?.displayText) ?? string(urlButton?.text); const buttonUrl = string(urlButton?.url);
      if (title || body || buttonLabel || buttonUrl || Object.keys(record(template.imageMessage)).length) {
        return { kind: 'card', title, body, buttonLabel: buttonLabel?.trim().slice(0, 120) ?? null, buttonUrl: buttonUrl && /^https?:\/\//i.test(buttonUrl) ? buttonUrl.slice(0, 2048) : null };
      }
    }
    return null;
  }
  private templateContent(message: JsonRecord): JsonRecord {
    const template = record(message.templateMessage); return record(template.hydratedTemplate ?? template.hydratedFourRowTemplate);
  }
}

@Injectable()
export class MetaCloudIncomingMessageWebhookAdapter implements IncomingMessageWebhookAdapter {
  readonly provider = 'whatsapp_cloud_api' as const;
  constructor(private readonly credentialCrypto: ChannelCredentialCryptoService) {}

  normalize(input: NormalizeInput & { readonly contacts?: ReadonlyArray<JsonRecord> }): IncomingWhatsappMessageDto | null {
    const message = record(input.value); let senderPhone = phoneDigits(string(message.from) ?? '');
    const rawSenderId = string(message.user_id) ?? string(message.from_user_id); let senderExternalId = normalizeExternalIdentity(rawSenderId);
    const contacts = input.contacts ?? [];
    let contact = contacts.find((candidate) => (isValidPhone(senderPhone) && phoneDigits(string(candidate.wa_id) ?? '') === senderPhone)
      || (senderExternalId !== null && normalizeExternalIdentity(string(candidate.user_id)) === senderExternalId));
    if (!senderExternalId) senderExternalId = normalizeExternalIdentity(string(contact?.user_id));
    if (!isValidPhone(senderPhone)) senderPhone = phoneDigits(string(contact?.wa_id) ?? '');
    if (!isValidPhone(senderPhone)) senderPhone = '';
    const externalMessageId = string(message.id); const messageType = (string(message.type) ?? 'unknown').slice(0, 80);
    if ((!senderPhone && !senderExternalId) || !externalMessageId || externalMessageId.length > 250) return null;
    if (!contact && senderExternalId) contact = contacts.find((candidate) => normalizeExternalIdentity(string(candidate.user_id)) === senderExternalId);
    const profile = record(contact?.profile); const occurredAt = toDate(message.timestamp); const bodyText = this.extractText(message, messageType)?.slice(0, 16000) ?? null;
    const mediaType = asMediaType(messageType); const mediaContent = mediaType ? record(message[mediaType]) : {}; const mediaId = string(mediaContent.id);
    const media = mediaType && mediaId ? this.createMedia(input.channelId, input.organizationId, mediaType, mediaId, JSON.stringify({ mediaId }), mediaContent) : null;
    const externalConversationId = senderExternalId ? `${input.channelId}:${META_EXTERNAL_RECORD_TYPE.businessScopedUserId}:${senderExternalId}` : `${input.channelId}:${senderPhone}`;
    const senderName = string(profile.name)?.trim().slice(0, 160) || senderExternalId;
    return new IncomingWhatsappMessageDto(input.organizationId, input.channelId, this.provider, externalMessageId, externalConversationId, senderPhone || null, senderExternalId, senderName, messageType, input.classifyCloserSignal(bodyText), bodyText, occurredAt, input.payloadHash, media);
  }

  private createMedia(channelId: string, organizationId: string, mediaType: InboundMediaType, sourceMediaId: string | null, sourcePayload: string, mediaContent: JsonRecord): InboundMediaDto {
    const encrypted = this.credentialCrypto.encryptPayload(organizationId, channelId, sourcePayload);
    const rawSize = mediaContent.file_size ?? mediaContent.fileLength; const parsedSize = typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' ? Number(rawSize) : NaN;
    const sizeBytes = Number.isSafeInteger(parsedSize) && parsedSize >= 0 && parsedSize <= 1_073_741_824 ? parsedSize : null;
    const rawHash = string(mediaContent.sha256) ?? string(mediaContent.fileSha256); const rawMimeType = string(mediaContent.mime_type) ?? string(mediaContent.mimetype); const rawFileName = string(mediaContent.filename) ?? string(mediaContent.fileName);
    return new InboundMediaDto(mediaType, sourceMediaId, encrypted.ciphertext, encrypted.iv, encrypted.authTag,
      rawMimeType && rawMimeType.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(rawMimeType) ? rawMimeType : null,
      rawFileName ? rawFileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 255) : null, sizeBytes, rawHash?.slice(0, 128) ?? null);
  }
  private extractText(message: JsonRecord, type: string): string | null {
    if (type === 'text') return string(record(message.text).body);
    if (['image', 'video', 'document'].includes(type)) return string(record(message[type]).caption);
    if (type === 'button') return string(record(message.button).text);
    if (type === 'interactive') { const interactive = record(message.interactive); return string(record(interactive.button_reply).title) ?? string(record(interactive.list_reply).title); }
    if (type === 'location') { const location = record(message.location); return string(location.name) ?? string(location.address); }
    return null;
  }
}
