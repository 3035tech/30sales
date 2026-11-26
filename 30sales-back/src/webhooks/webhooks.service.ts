import { createHash } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { ChannelsService } from '../channels/channels.service';
import { CHANNEL_CONNECTION_STATUS } from '../channels/channels.constants';
import type { ChannelConnectionStatus } from '../channels/channels.dto';
import { env } from '../config/env';
import { evolutionHistoryMessageSchema, EvolutionChatStateDto, EvolutionContactUpdateDto, EvolutionGroupMetadataDto, EvolutionGroupParticipantsUpdateDto, EvolutionHistoryBatchDto, EvolutionMessageMutationDto, InboundMediaDto, IncomingWhatsappMessageDto, InterpretationFailureSignalDto, ProviderWebhookEventDto, type EvolutionMessageMetadata, type EvolutionGroupParticipantChange, type InterpretationFailureSignalInputDto, type ProviderEventFamily, WhatsappMessageStatusDto } from './webhooks.dto';
import { EvolutionMessageStatusWebhookAdapter, MetaCloudMessageStatusWebhookAdapter } from './message-status-webhook-adapters';
import { EvolutionIncomingMessageWebhookAdapter, MetaCloudIncomingMessageWebhookAdapter } from './incoming-message-webhook-adapters';
import { EvolutionWebhookEnvelopeAdapter, matchesWebhookSecret, MetaCloudWebhookEnvelopeAdapter } from './provider-webhook-envelope.adapters';
import { WebhooksRepository } from './webhooks.repository';
import { EVOLUTION_CONNECTION_STATE, EVOLUTION_WEBHOOK_EVENT, META_WHATSAPP_WEBHOOK_FIELD } from './provider-webhook-events.constants';

type JsonRecord = Record<string, unknown>;
const knownEvolutionEvents: ReadonlySet<string> = new Set(Object.values(EVOLUTION_WEBHOOK_EVENT));

@Injectable()
export class WebhooksService {
  private readonly evolutionEnvelopeAdapter = new EvolutionWebhookEnvelopeAdapter();
  private readonly metaEnvelopeAdapter = new MetaCloudWebhookEnvelopeAdapter();

  constructor(
    private readonly repository: WebhooksRepository,
    private readonly credentialCrypto: ChannelCredentialCryptoService,
    private readonly credentialResolver: ChannelCredentialResolverService,
    private readonly channelsService: ChannelsService,
    @Inject(EvolutionMessageStatusWebhookAdapter) private readonly evolutionStatusAdapter: EvolutionMessageStatusWebhookAdapter = new EvolutionMessageStatusWebhookAdapter(),
    @Inject(MetaCloudMessageStatusWebhookAdapter) private readonly metaStatusAdapter: MetaCloudMessageStatusWebhookAdapter = new MetaCloudMessageStatusWebhookAdapter(),
    @Inject(EvolutionIncomingMessageWebhookAdapter) private readonly evolutionMessageAdapter: EvolutionIncomingMessageWebhookAdapter = new EvolutionIncomingMessageWebhookAdapter(credentialCrypto),
    @Inject(MetaCloudIncomingMessageWebhookAdapter) private readonly metaMessageAdapter: MetaCloudIncomingMessageWebhookAdapter = new MetaCloudIncomingMessageWebhookAdapter(credentialCrypto),
  ) {}

  verifyCloudChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    return this.metaEnvelopeAdapter.verifyChallenge(mode, token, challenge, env.META_WEBHOOK_VERIFY_TOKEN);
  }

  async ingestEvolution(channelId: string, presentedWebhookSecret: string | undefined, payload: unknown, rawBody: Buffer): Promise<{ accepted: true; processed: number }> {
    const channel = await this.repository.findEvolutionChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = await this.credentialResolver.resolve(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
    if (credentials.provider !== 'evolution') throw new UnauthorizedException();
    this.evolutionEnvelopeAdapter.authenticate(presentedWebhookSecret, credentials.webhookSecret);

    const envelope = this.evolutionEnvelopeAdapter.normalize(payload);
    const { eventName, items: data } = envelope;
    if (envelope.instance !== channel.providerChannelId) throw new UnauthorizedException();
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
        const message = this.evolutionMessageAdapter.normalize({ channelId: channel.id, organizationId: channel.organizationId, value: item, payloadHash, classifyCloserSignal: (bodyText) => this.classifyCloserSignal(bodyText) });
        const pollTarget = !message?.isFromMe && message?.messageType.toLowerCase().replace(/[^a-z]/g, '') === 'pollupdatemessage'
          ? this.evolutionMessageAdapter.pollUpdateTarget(item)
          : null;
        if (message && pollTarget) {
          if (message.externalMessageId) await this.repository.enqueueEvolutionPollResultsRefresh({ organizationId: channel.organizationId, channelId: channel.id, externalConversationId: message.externalConversationId, pollMessageId: pollTarget.pollMessageId, voteUpdateMessageId: message.externalMessageId });
          // Votes are refresh triggers, not standalone chat messages. The durable worker
          // resolves the provider result after this webhook has returned.
          processed += 1;
          continue;
        }
        if (message && (message.isFromMe
          ? await this.repository.recordEvolutionOutgoingMessage(message)
          : await this.repository.recordIncomingMessage(message)) === 'created') processed += 1;
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.messagesSet) {
        processed += await this.enqueueEvolutionHistorySnapshot(channel.id, channel.organizationId, item, payloadHash);
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.messagesUpdate || eventName === EVOLUTION_WEBHOOK_EVENT.sendMessageUpdate) {
        const status = this.evolutionStatusAdapter.normalize(channel.id, channel.organizationId, item, payloadHash);
        if (status) {
          const result = await this.repository.recordMessageStatus(status);
          if (result === 'updated') processed += 1;
          if (result === 'unmatched') processed += await this.recordUnmatchedStatus(status);
        }
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.messagesEdited || eventName === EVOLUTION_WEBHOOK_EVENT.messagesDelete) {
        const mutation = this.normalizeEvolutionMessageMutation(channel.id, channel.organizationId, eventName, item, payloadHash);
        if (mutation) {
          const result = await this.repository.applyEvolutionMessageMutation(mutation);
          if (result === 'updated') processed += 1;
        }
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.chatsUpsert || eventName === EVOLUTION_WEBHOOK_EVENT.chatsUpdate || eventName === EVOLUTION_WEBHOOK_EVENT.chatsDelete || eventName === EVOLUTION_WEBHOOK_EVENT.chatsSet) {
        const chatState = this.normalizeEvolutionChatState(channel.id, channel.organizationId, eventName, item, payloadHash);
        if (chatState) {
          const result = await this.repository.recordEvolutionChatState(chatState);
          if (result === 'updated') processed += 1;
        }
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.contactsSet || eventName === EVOLUTION_WEBHOOK_EVENT.contactsUpsert || eventName === EVOLUTION_WEBHOOK_EVENT.contactsUpdate) {
        processed += await this.syncKnownEvolutionContact(channel.id, channel.organizationId, item);
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.groupsUpsert || eventName === EVOLUTION_WEBHOOK_EVENT.groupsUpdate || eventName === EVOLUTION_WEBHOOK_EVENT.groupUpdate) {
        const group = this.normalizeEvolutionGroupMetadata(channel.id, channel.organizationId, eventName, item, payloadHash);
        if (group && await this.repository.recordEvolutionGroupMetadata(group) === 'updated') processed += 1;
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.groupParticipantsUpdate) {
        const update = this.normalizeEvolutionGroupParticipants(channel.id, channel.organizationId, item, payloadHash);
        if (update && await this.repository.recordEvolutionGroupParticipants(update) === 'updated') processed += 1;
      } else if (eventName === EVOLUTION_WEBHOOK_EVENT.presenceUpdate) {
        processed += await this.publishEvolutionPresence(channel.id, channel.organizationId, item);
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

  private async publishEvolutionPresence(channelId: string, organizationId: string, value: unknown): Promise<number> {
    const data = this.record(value);
    const rawId = this.string(data.id);
    if (!rawId || rawId.length > 250 || rawId === 'status@broadcast') return 0;
    const isGroup = rawId.endsWith('@g.us');
    const digits = this.phoneDigits(rawId.split('@')[0].split(':')[0]);
    const externalConversationId = `${channelId}:${isGroup ? rawId : digits}`;
    if (!isGroup && !this.isValidPhone(digits)) return 0;
    const presences = this.record(data.presences);
    let processed = 0;
    for (const [participant, rawPresence] of Object.entries(presences).slice(0, 20)) {
      if (participant.length > 250) continue;
      const state = this.string(this.record(rawPresence).lastKnownPresence)?.toLowerCase();
      if (state !== 'composing' && state !== 'recording' && state !== 'paused' && state !== 'available' && state !== 'unavailable') continue;
      const participantId = isGroup ? participant.slice(0, 250) : null;
      if (await this.repository.publishEvolutionPresence({ organizationId, channelId, externalConversationId, state, participantId })) processed += 1;
    }
    return processed;
  }

  async processEvolutionHistoryBatch(batch: EvolutionHistoryBatchDto): Promise<number> {
    const payload = this.credentialCrypto.decryptPayload(batch.organizationId, batch.channelId, { ciphertext: batch.payloadCiphertext, iv: batch.payloadIv, authTag: batch.payloadAuthTag });
    const decoded: unknown = JSON.parse(payload);
    if (!Array.isArray(decoded)) throw new Error('EVOLUTION_HISTORY_PAYLOAD_INVALID');
    let processed = 0;
    for (const value of decoded) {
      const parsed = evolutionHistoryMessageSchema.safeParse(value);
      if (!parsed.success || parsed.data.organizationId !== batch.organizationId || parsed.data.channelId !== batch.channelId || parsed.data.provider !== 'evolution') continue;
      const message = new IncomingWhatsappMessageDto(
        parsed.data.organizationId, parsed.data.channelId, parsed.data.provider, parsed.data.externalMessageId,
        parsed.data.externalConversationId, parsed.data.senderPhone, parsed.data.senderExternalId, parsed.data.senderName,
        parsed.data.messageType, parsed.data.closerSignal, parsed.data.bodyText, parsed.data.occurredAt, parsed.data.payloadHash,
        parsed.data.media ? new InboundMediaDto(parsed.data.media.mediaType, parsed.data.media.sourceMediaId, parsed.data.media.sourceCiphertext, parsed.data.media.sourceIv, parsed.data.media.sourceAuthTag, parsed.data.media.mimeType, parsed.data.media.fileName, parsed.data.media.sizeBytes, parsed.data.media.sha256) : null,
        parsed.data.evolutionMetadata,
        parsed.data.conversationType, parsed.data.displayName, parsed.data.providerRecipientId,
        parsed.data.isFromMe,
      );
      const result = message.isFromMe
        ? await this.repository.recordEvolutionOutgoingMessage(message)
        : await this.repository.recordHistoricalIncomingMessage(message);
      if (result === 'created') processed += 1;
    }
    return processed;
  }

  private async enqueueEvolutionHistorySnapshot(channelId: string, organizationId: string, value: unknown, payloadHash: string): Promise<number> {
    const data = this.record(value);
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    const messages = rawMessages.map((item) => this.evolutionMessageAdapter.normalize({ channelId, organizationId, value: item, payloadHash, classifyCloserSignal: (bodyText) => this.classifyCloserSignal(bodyText) })).filter((message): message is IncomingWhatsappMessageDto => message !== null);
    const snapshotEventId = createHash('sha256').update(`${channelId}:messages.set:${payloadHash}`).digest('hex');
    const event = new ProviderWebhookEventDto(organizationId, channelId, 'evolution', snapshotEventId, 'evolution.messages.set', 'sync', payloadHash);
    await this.repository.recordProviderEvent(event);
    const batchSize = 25;
    let enqueued = 0;
    for (let index = 0; index < messages.length; index += batchSize) {
      const chunk = messages.slice(index, index + batchSize);
      const externalEventId = createHash('sha256').update(`${snapshotEventId}:${index / batchSize}`).digest('hex');
      const encrypted = this.credentialCrypto.encryptPayload(organizationId, channelId, JSON.stringify(chunk));
      if (await this.repository.enqueueEvolutionHistoryBatch({ organizationId, channelId, externalEventId, payloadCiphertext: encrypted.ciphertext, payloadIv: encrypted.iv, payloadAuthTag: encrypted.authTag })) enqueued += chunk.length;
    }
    return enqueued;
  }

  async ingestInterpretationFailure(channelId: string, webhookSecret: string | undefined, input: InterpretationFailureSignalInputDto, rawBody: Buffer): Promise<{ accepted: true; outcome: string }> {
    const channel = await this.repository.findChannel(channelId);
    if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) throw new UnauthorizedException();
    const credentials = await this.credentialResolver.resolve(channel.organizationId, channel.id, { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag });
    const signalSecret = credentials.provider === 'evolution' ? credentials.webhookSecret : credentials.signalSecret;
    if (!matchesWebhookSecret(webhookSecret, signalSecret)) throw new UnauthorizedException();
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
    this.metaEnvelopeAdapter.authenticate(signature, rawBody, env.META_APP_SECRET);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let processed = 0;
    for (const change of this.metaEnvelopeAdapter.normalize(payload)) {
      const { field, value } = change;
      const metadata = this.record(value.metadata);
      const phoneNumberId = this.string(metadata.phone_number_id) ?? this.string(value.phone_number_id);
      const channel = phoneNumberId
        ? await this.repository.findCloudChannel(phoneNumberId)
        : await this.repository.findCloudAccountChannel(change.entryId ?? '');
      if (!channel?.isActive) continue;
      if (field !== META_WHATSAPP_WEBHOOK_FIELD.messages) {
        const fingerprint = createHash('sha256').update(JSON.stringify(change) ?? '').digest('hex');
        const eventId = createHash('sha256').update(`${channel.id}:${field}:${fingerprint}`).digest('hex');
        const eventDto = new ProviderWebhookEventDto(channel.organizationId, channel.id, 'whatsapp_cloud_api', eventId, `meta.${field}`, this.metaEventFamily(field), fingerprint);
        if (await this.repository.recordProviderEvent(eventDto) === 'created') processed += 1;
        continue;
      }
      if (!phoneNumberId) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts.map((contact) => this.record(contact)) : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const messageValue of messages) {
        const message = this.metaMessageAdapter.normalize({ channelId: channel.id, organizationId: channel.organizationId, value: messageValue, contacts, payloadHash, classifyCloserSignal: (bodyText) => this.classifyCloserSignal(bodyText) });
        if (!message) continue;
        if (await this.repository.recordIncomingMessage(message) === 'created') processed += 1;
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const statusValue of statuses) {
        const status = this.metaStatusAdapter.normalize(channel.id, channel.organizationId, statusValue, payloadHash);
        if (status) {
          const result = await this.repository.recordMessageStatus(status);
          if (result === 'updated') processed += 1;
          if (result === 'unmatched') processed += await this.recordUnmatchedStatus(status);
        }
      }
    }
    return { accepted: true, processed };
  }

  private async recordUnmatchedStatus(status: WhatsappMessageStatusDto): Promise<number> {
    return await this.repository.recordUnmatchedMessageStatus(status) === 'created' ? 1 : 0;
  }

  private async syncKnownEvolutionContact(channelId: string, organizationId: string, value: unknown): Promise<number> {
    const contact = this.record(value);
    const jid = [contact.remoteJid, contact.remoteJidAlt, contact.id, contact.jid]
      .map((candidate) => this.string(candidate))
      .find((candidate) => candidate !== null && (!candidate.includes('@') || candidate.endsWith('@s.whatsapp.net') || candidate.endsWith('@c.us')));
    const phoneDigits = jid ? this.phoneDigits(jid) : '';
    if (!this.isValidPhone(phoneDigits)) return 0;

    const displayName = (this.string(contact.pushName)?.trim() || this.string(contact.name)?.trim() || this.string(contact.verifiedName)?.trim() || '').slice(0, 160) || null;
    const fingerprint = createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');
    const eventId = createHash('sha256').update(`${channelId}:contacts:${phoneDigits}:${fingerprint}`).digest('hex');
    const result = await this.repository.updateKnownEvolutionContact(new EvolutionContactUpdateDto(organizationId, channelId, eventId, phoneDigits, displayName, fingerprint));
    return result === 'updated' ? 1 : 0;
  }

  private normalizeEvolutionChatState(channelId: string, organizationId: string, eventName: string, value: unknown, payloadHash: string): EvolutionChatStateDto | null {
    const chat = this.record(value);
    const jid = this.string(chat.id) ?? this.string(chat.remoteJid) ?? this.string(chat.jid);
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return null;
    const phoneDigits = this.phoneDigits(jid);
    if (!this.isValidPhone(phoneDigits)) return null;
    const archived = typeof chat.archived === 'boolean' ? chat.archived : typeof chat.archive === 'boolean' ? chat.archive : null;
    const pinned = typeof chat.pinned === 'boolean' ? chat.pinned : null;
    const unreadCandidate = chat.unreadCount ?? chat.unreadMessages;
    const unreadCount = typeof unreadCandidate === 'number' && Number.isInteger(unreadCandidate) && unreadCandidate >= 0 ? unreadCandidate : null;
    const deleted = eventName === EVOLUTION_WEBHOOK_EVENT.chatsDelete ? true
      : eventName === EVOLUTION_WEBHOOK_EVENT.chatsUpsert || eventName === EVOLUTION_WEBHOOK_EVENT.chatsSet ? false : null;
    if (archived === null && pinned === null && unreadCount === null && deleted === null) return null;
    const fingerprint = createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');
    const externalEventId = createHash('sha256').update(`${channelId}:${eventName}:${jid}:${fingerprint}`).digest('hex');
    return new EvolutionChatStateDto(organizationId, channelId, externalEventId, `${channelId}:${phoneDigits}`, archived, pinned, unreadCount, deleted, payloadHash);
  }

  private normalizeEvolutionGroupMetadata(channelId: string, organizationId: string, eventName: string, value: unknown, payloadHash: string): EvolutionGroupMetadataDto | null {
    const data = this.record(value);
    const jid = this.string(data.id) ?? this.string(data.jid) ?? this.string(data.groupJid) ?? this.string(data.remoteJid);
    const displayName = this.string(data.subject) ?? this.string(data.name);
    if (!jid?.endsWith('@g.us') || jid.length > 250 || !displayName?.trim()) return null;
    const normalizedName = displayName.trim().slice(0, 160);
    const externalEventId = createHash('sha256').update(`${channelId}:${eventName}:${jid}:${normalizedName}:${payloadHash}`).digest('hex');
    return new EvolutionGroupMetadataDto(organizationId, channelId, externalEventId, `${channelId}:${jid}`, jid, normalizedName, payloadHash);
  }

  private normalizeEvolutionGroupParticipants(channelId: string, organizationId: string, value: unknown, payloadHash: string): EvolutionGroupParticipantsUpdateDto | null {
    const data = this.record(value);
    const groupJid = this.string(data.id) ?? this.string(data.jid) ?? this.string(data.groupJid) ?? this.string(data.remoteJid);
    const rawParticipants = Array.isArray(data.participants) ? data.participants : [];
    const rawAction = (this.string(data.action) ?? this.string(data.operation) ?? '').toLowerCase();
    const action: EvolutionGroupParticipantChange['action'] | null = ['add', 'join', 'joined'].includes(rawAction) ? 'add'
      : ['remove', 'leave', 'left'].includes(rawAction) ? 'remove'
      : ['promote', 'promoted'].includes(rawAction) ? 'promote'
      : ['demote', 'demoted'].includes(rawAction) ? 'demote' : null;
    if (!groupJid?.endsWith('@g.us') || groupJid.length > 250 || !action) return null;
    const participants: EvolutionGroupParticipantChange[] = rawParticipants.slice(0, 100).flatMap((entry): EvolutionGroupParticipantChange[] => {
      const participant = typeof entry === 'string' ? { id: entry } : this.record(entry);
      const externalParticipantId = this.string(participant.id) ?? this.string(participant.jid) ?? this.string(participant.phoneNumber);
      if (!externalParticipantId || externalParticipantId.length > 250) return [];
      const phoneDigits = externalParticipantId.split('@')[0].split(':')[0].replace(/\D/g, '');
      return [{ externalParticipantId, phone: phoneDigits.length >= 8 && phoneDigits.length <= 15 ? `+${phoneDigits}` : null, displayName: this.string(participant.name) ?? this.string(participant.notify) ?? null, action }];
    });
    if (participants.length === 0) return null;
    const fingerprint = createHash('sha256').update(JSON.stringify({ groupJid, action, participants, payloadHash })).digest('hex');
    const externalEventId = createHash('sha256').update(`${channelId}:group.participants.update:${fingerprint}`).digest('hex');
    return new EvolutionGroupParticipantsUpdateDto(organizationId, channelId, externalEventId, `${channelId}:${groupJid}`, participants, payloadHash);
  }

  private normalizeEvolutionMessageMutation(channelId: string, organizationId: string, eventType: string, value: unknown, payloadHash: string): EvolutionMessageMutationDto | null {
    if (eventType !== EVOLUTION_WEBHOOK_EVENT.messagesEdited && eventType !== EVOLUTION_WEBHOOK_EVENT.messagesDelete) return null;
    const data = this.record(value);
    const key = this.record(data.key);
    const protocol = this.record(data.protocolMessage);
    const protocolKey = this.record(protocol.key);
    const secretEncrypted = this.record(data.secretEncryptedMessage);
    const secretTarget = this.record(secretEncrypted.targetMessageKey);
    const edited = this.record(data.editedMessage);
    const editedKey = this.record(edited.key);
    const rawMessageId = this.string(data.targetMessageId) ?? this.string(data.messageId)
      ?? this.string(protocolKey.id) ?? this.string(protocolKey.ID)
      ?? this.string(secretTarget.id) ?? this.string(secretTarget.ID)
      ?? this.string(editedKey.id) ?? this.string(editedKey.ID)
      ?? this.string(key.id) ?? this.string(key.ID);
    if (!rawMessageId || rawMessageId.length > 250) return null;
    const eventFingerprint = createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');
    const externalEventId = createHash('sha256').update(`${channelId}:${eventType}:${rawMessageId}:${eventFingerprint}`).digest('hex');
    const content = Object.keys(this.record(protocol.editedMessage)).length > 0 ? this.record(protocol.editedMessage)
      : Object.keys(this.record(data.message)).length > 0 ? this.record(data.message) : {};
    const editedContent = Object.keys(this.record(edited.message)).length > 0 ? this.record(edited.message) : edited;
    const bodyText = eventType === EVOLUTION_WEBHOOK_EVENT.messagesEdited
      ? this.evolutionMessageAdapter.extractText(this.evolutionMessageAdapter.unwrap(Object.keys(content).length > 0 ? content : editedContent))?.slice(0, 16000) ?? null
      : null;
    return new EvolutionMessageMutationDto(organizationId, channelId, rawMessageId, externalEventId, eventType, bodyText, payloadHash);
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

  private toDate(value: unknown): Date {
    const timestamp = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp) : new Date();
  }

  private phoneDigits(value: string): string { return value.split('@')[0].split(':')[0].replace(/\D/g, ''); }
  private isValidPhone(value: string): boolean { return value.length >= 8 && value.length <= 15 && value[0] !== '0'; }

  private record(value: unknown): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) record[key] = entry;
    return record;
  }
  private string(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
}
