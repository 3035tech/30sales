import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, auditEvents, conversationReads, conversationTagLinks, conversationTags, conversations, messages, messagingChannels, people } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { ChannelRecordDto } from '../channels/channels.dto';
import { ConversationAssignDto, ConversationAssigneeDto, ConversationAutomationUpdateDto, ConversationControlDto, ConversationControlResultDto, ConversationListItemDto, ConversationMessageDeliveryDto, ConversationMessageSendDto, ConversationMessagesQueryDto, ConversationNoteCreateDto, ConversationPageDto, ConversationReadDto, ConversationReadResultDto, ConversationRepositoryListDto, ConversationTagDto, ConversationTagMutationDto, ConversationTagRemoveDto, MessageRecordDto } from './inbox.dto';

type PreparedMessageSend = { kind: 'prepared'; message: MessageRecordDto; channelId: string; recipientPhone: string; provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; credentials: { ciphertext: string; iv: string; authTag: string } };
type MessageSendResult = PreparedMessageSend | { kind: 'duplicate'; message: MessageRecordDto } | 'not_found' | 'not_owner' | 'automation_not_human' | 'channel_unavailable' | 'credentials_missing' | 'recipient_missing';

@Injectable()
export class InboxRepository {
  async listAssignees(organizationId: string): Promise<ConversationAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name, role: authMember.role }).from(authMember)
      .innerJoin(authUser, eq(authUser.id, authMember.userId)).where(and(eq(authMember.organizationId, organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY['owner','admin','manager','bdr','sdr','closer']::text[]`)).orderBy(asc(authUser.name));
    return rows.map((row) => new ConversationAssigneeDto(row.id, row.name, row.role));
  }

  async list(input: ConversationRepositoryListDto): Promise<ConversationPageDto> {
    const conditions = [eq(conversations.organizationId, input.organizationId)];
    const unreadExists = sql<boolean>`exists (select 1 from messages unread_message where unread_message.organization_id = ${input.organizationId} and unread_message.conversation_id = ${conversations.id} and unread_message.direction = 'inbound' and unread_message.created_at > coalesce((select conversation_read.last_read_at from conversation_reads conversation_read where conversation_read.organization_id = ${input.organizationId} and conversation_read.conversation_id = ${conversations.id} and conversation_read.user_id = ${input.userId}), 'epoch'::timestamptz))`;
    if (input.query.status) conditions.push(eq(conversations.status, input.query.status));
    if (input.query.conversationId) conditions.push(eq(conversations.id, input.query.conversationId));
    if (input.query.channelId) conditions.push(eq(conversations.channelId, input.query.channelId));
    if (input.query.ownerUserId === 'unassigned') conditions.push(sql`${conversations.ownerUserId} is null`);
    else if (input.query.ownerUserId) conditions.push(eq(conversations.ownerUserId, input.query.ownerUserId));
    if (input.query.search) {
      const pattern = `%${input.query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(accounts.name, pattern), ilike(people.name, pattern), ilike(people.phone, pattern))!);
    }
    if (input.query.unreadOnly) conditions.push(unreadExists);
    if (input.query.tagId) conditions.push(sql`exists (select 1 from conversation_tag_links ctl where ctl.organization_id = ${input.organizationId} and ctl.conversation_id = ${conversations.id} and ctl.tag_id = ${input.query.tagId})`);
    const [{ total }] = await database.select({ total: count() }).from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .where(and(...conditions));
    const rows = await database.select({ id: conversations.id, provider: conversations.provider, status: conversations.status, accountName: accounts.name, personName: people.name, personPhone: people.phone, lastMessageAt: conversations.lastMessageAt, createdAt: conversations.createdAt, channelId: conversations.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, channelProvider: messagingChannels.provider, channelActive: messagingChannels.isActive, channelConfigured: messagingChannels.credentialsCiphertext, ownerUserId: conversations.ownerUserId, ownerName: authUser.name, automationMode: conversations.automationMode, unread: unreadExists })
      .from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .leftJoin(authMember, and(eq(authMember.organizationId, conversations.organizationId), eq(authMember.userId, conversations.ownerUserId)))
      .leftJoin(authUser, eq(authUser.id, authMember.userId))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id))
      .limit(input.query.limit).offset(input.query.offset);
    const tagRows = rows.length ? await database.select({ conversationId: conversationTagLinks.conversationId, id: conversationTags.id, name: conversationTags.name }).from(conversationTagLinks)
      .innerJoin(conversationTags, and(eq(conversationTags.id, conversationTagLinks.tagId), eq(conversationTags.organizationId, conversationTagLinks.organizationId)))
      .where(and(eq(conversationTagLinks.organizationId, input.organizationId), inArray(conversationTagLinks.conversationId, rows.map((row) => row.id)))).orderBy(asc(conversationTags.name)) : [];
    const tagsByConversation = new Map<string, ConversationTagDto[]>();
    for (const tag of tagRows) tagsByConversation.set(tag.conversationId, [...(tagsByConversation.get(tag.conversationId) ?? []), new ConversationTagDto(tag.id, tag.name)]);
    const data = rows.map((row) => new ConversationListItemDto(row.id, row.provider, row.status, row.accountName, row.personName, row.lastMessageAt?.toISOString() ?? null, row.createdAt.toISOString(), row.channelId, row.channelName, row.channelPhoneNumber, row.channelProvider, row.ownerUserId, row.ownerName, row.automationMode as ConversationListItemDto['automationMode'], Boolean(row.personPhone && row.channelActive && row.channelConfigured), row.unread, tagsByConversation.get(row.id) ?? []));
    return new ConversationPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async listTags(organizationId: string): Promise<ConversationTagDto[]> {
    const rows = await database.select({ id: conversationTags.id, name: conversationTags.name }).from(conversationTags)
      .where(eq(conversationTags.organizationId, organizationId)).orderBy(asc(conversationTags.name));
    return rows.map((row) => new ConversationTagDto(row.id, row.name));
  }

  async addTag(input: ConversationTagMutationDto): Promise<ConversationTagDto | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const name = input.name.trim().replace(/\s+/g, ' ');
      const normalizedName = name.toLocaleLowerCase('en-US');
      const [tag] = await transaction.insert(conversationTags).values({ organizationId: input.organizationId, name, normalizedName, createdByUserId: input.actorUserId })
        .onConflictDoUpdate({ target: [conversationTags.organizationId, conversationTags.normalizedName], set: { name } })
        .returning({ id: conversationTags.id, name: conversationTags.name });
      const [link] = await transaction.insert(conversationTagLinks).values({ organizationId: input.organizationId, conversationId: input.conversationId, tagId: tag.id, createdByUserId: input.actorUserId })
        .onConflictDoNothing({ target: [conversationTagLinks.organizationId, conversationTagLinks.conversationId, conversationTagLinks.tagId] }).returning({ id: conversationTagLinks.id });
      if (link) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.tag_added', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { tagId: tag.id, tagName: tag.name } });
      return new ConversationTagDto(tag.id, tag.name);
    });
  }

  async removeTag(input: ConversationTagRemoveDto): Promise<'ok' | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const [removed] = await transaction.delete(conversationTagLinks).where(and(eq(conversationTagLinks.organizationId, input.organizationId), eq(conversationTagLinks.conversationId, input.conversationId), eq(conversationTagLinks.tagId, input.tagId))).returning({ tagId: conversationTagLinks.tagId });
      if (removed) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.tag_removed', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { tagId: input.tagId } });
      return 'ok';
    });
  }

  async claim(input: ConversationControlDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      if (current.ownerUserId === input.actorUserId && current.automationMode === 'human') return new ConversationControlResultDto(current.id, input.actorUserId, 'human');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: input.actorUserId, automationMode: 'human', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.claimed', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, updated.automationMode as ConversationControlResultDto['automationMode']);
    });
  }

  async release(input: ConversationControlDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      if (!current.ownerUserId && current.automationMode === 'paused') return new ConversationControlResultDto(current.id, null, 'paused');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: null, automationMode: 'paused', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.released', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, updated.automationMode as ConversationControlResultDto['automationMode']);
    });
  }

  async assign(input: ConversationAssignDto): Promise<ConversationControlResultDto | 'owned' | 'not_found' | 'invalid_assignee'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      const [membership] = await transaction.select({ id: authMember.id }).from(authMember)
        .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.ownerUserId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY['owner','admin','manager','bdr','sdr','closer']::text[]`)).for('share').limit(1);
      if (!membership) return 'invalid_assignee';
      if (current.ownerUserId === input.ownerUserId && current.automationMode === 'human') return new ConversationControlResultDto(current.id, input.ownerUserId, 'human');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: input.ownerUserId, automationMode: 'human', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.assigned', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, updated.automationMode as ConversationControlResultDto['automationMode']);
    });
  }

  async setAutomationMode(input: ConversationAutomationUpdateDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      const ownerUserId = input.mode === 'sofia' ? null : input.mode === 'human' ? input.actorUserId : current.ownerUserId;
      if (current.ownerUserId === ownerUserId && current.automationMode === input.mode) return new ConversationControlResultDto(current.id, current.ownerUserId, input.mode);
      const [updated] = await transaction.update(conversations).set({ ownerUserId, automationMode: input.mode, updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: input.mode === 'sofia' ? 'conversation.sofia_resumed' : input.mode === 'paused' ? 'conversation.sofia_paused' : 'conversation.human_mode_set', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, updated.automationMode as ConversationControlResultDto['automationMode']);
    });
  }

  async listChannels(organizationId: string): Promise<ChannelRecordDto[]> {
    const rows = await database.select().from(messagingChannels).where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.isActive, true))).orderBy(messagingChannels.displayName, messagingChannels.id);
    return rows.map((row) => new ChannelRecordDto(row.id, row.provider as ChannelRecordDto['provider'], row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.createdAt.toISOString(), row.updatedAt.toISOString(), Boolean(row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag)));
  }

  async listMessages(input: ConversationMessagesQueryDto): Promise<MessageRecordDto[] | null> {
    const [conversation] = await database.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1);
    if (!conversation) return null;
    const rows = await database.select({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt })
      .from(messages).leftJoin(authUser, eq(authUser.id, messages.actorUserId)).where(and(eq(messages.conversationId, input.conversationId), eq(messages.organizationId, input.organizationId)))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(input.limit).offset(input.offset);
    return rows.reverse().map((row) => new MessageRecordDto(row.id, row.direction, row.actorType, row.bodyText, row.deliveryState, row.occurredAt.toISOString(), row.actorUserId, row.actorName));
  }

  async markRead(input: ConversationReadDto): Promise<ConversationReadResultDto | 'not_found' | 'invalid_message'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (!input.lastInboundMessageId) {
        const [current] = await transaction.select({ lastReadAt: conversationReads.lastReadAt }).from(conversationReads)
          .where(and(eq(conversationReads.organizationId, input.organizationId), eq(conversationReads.conversationId, input.conversationId), eq(conversationReads.userId, input.userId))).limit(1);
        return new ConversationReadResultDto(input.conversationId, current?.lastReadAt?.toISOString() ?? null);
      }
      const [message] = await transaction.select({ createdAt: messages.createdAt }).from(messages)
        .where(and(eq(messages.id, input.lastInboundMessageId), eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.direction, 'inbound'))).limit(1);
      if (!message) return 'invalid_message';
      const [current] = await transaction.select({ id: conversationReads.id, lastReadAt: conversationReads.lastReadAt }).from(conversationReads)
        .where(and(eq(conversationReads.organizationId, input.organizationId), eq(conversationReads.conversationId, input.conversationId), eq(conversationReads.userId, input.userId))).for('update').limit(1);
      if (current?.lastReadAt && current.lastReadAt >= message.createdAt) return new ConversationReadResultDto(input.conversationId, current.lastReadAt.toISOString());
      const lastReadAt = message.createdAt;
      if (current) {
        await transaction.update(conversationReads).set({ lastReadAt, updatedAt: new Date() }).where(and(eq(conversationReads.id, current.id), eq(conversationReads.organizationId, input.organizationId)));
      } else {
        await transaction.insert(conversationReads).values({ organizationId: input.organizationId, conversationId: input.conversationId, userId: input.userId, lastReadAt });
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'conversation.marked_read', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { lastReadAt: lastReadAt.toISOString(), lastInboundMessageId: input.lastInboundMessageId } });
      return new ConversationReadResultDto(input.conversationId, lastReadAt.toISOString());
    });
  }

  async addNote(input: ConversationNoteCreateDto): Promise<MessageRecordDto | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      const [duplicate] = await transaction.select({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt }).from(messages)
        .leftJoin(authUser, eq(authUser.id, messages.actorUserId))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.idempotencyKey, input.idempotencyKey))).limit(1);
      if (duplicate) return new MessageRecordDto(duplicate.id, duplicate.direction, duplicate.actorType, duplicate.bodyText, duplicate.deliveryState, duplicate.occurredAt.toISOString(), duplicate.actorUserId, duplicate.actorName);
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const [actor] = await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, input.actorUserId)).limit(1);
      const occurredAt = new Date();
      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId: input.conversationId, direction: 'internal', actorType: 'user', actorUserId: input.actorUserId, bodyText: input.bodyText, deliveryState: 'unknown', idempotencyKey: input.idempotencyKey, occurredAt }).returning({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.internal_note_added', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { messageId: message.id } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: input.conversationId, occurredAt: occurredAt.toISOString() })})`);
      return new MessageRecordDto(message.id, message.direction, message.actorType, message.bodyText, message.deliveryState, message.occurredAt.toISOString(), message.actorUserId, actor?.name ?? null);
    });
  }

  async prepareMessageSend(input: ConversationMessageSendDto): Promise<MessageSendResult> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, personId: conversations.personId, channelId: conversations.channelId, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      const [duplicate] = await transaction.select({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt }).from(messages)
        .leftJoin(authUser, eq(authUser.id, messages.actorUserId))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.idempotencyKey, input.idempotencyKey))).limit(1);
      if (duplicate) return { kind: 'duplicate', message: new MessageRecordDto(duplicate.id, duplicate.direction, duplicate.actorType, duplicate.bodyText, duplicate.deliveryState, duplicate.occurredAt.toISOString(), duplicate.actorUserId, duplicate.actorName) };
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      if (conversation.automationMode !== 'human') return 'automation_not_human';
      if (!conversation.personId || !conversation.channelId) return 'channel_unavailable';
      const [person] = await transaction.select({ phone: people.phone }).from(people).where(and(eq(people.id, conversation.personId), eq(people.organizationId, input.organizationId))).limit(1);
      const recipientPhone = (person?.phone ?? '').replace(/\D/g, '');
      if (recipientPhone.length < 8 || recipientPhone.length > 15 || recipientPhone[0] === '0') return 'recipient_missing';
      const [channel] = await transaction.select({ provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, conversation.channelId), eq(messagingChannels.organizationId, input.organizationId))).limit(1);
      if (!channel?.isActive) return 'channel_unavailable';
      if (!channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) return 'credentials_missing';
      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId: input.conversationId, direction: 'outbound', actorType: 'user', actorUserId: input.actorUserId, bodyText: input.bodyText, deliveryState: 'requested', idempotencyKey: input.idempotencyKey, occurredAt: new Date() }).returning({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.message_requested', entityType: 'conversation', entityId: conversation.id, correlationId: input.correlationId, afterState: { messageId: message.id, channelProvider: channel.provider, deliveryState: 'requested' } });
      return {
        kind: 'prepared', message: new MessageRecordDto(message.id, message.direction, message.actorType, message.bodyText, message.deliveryState, message.occurredAt.toISOString(), message.actorUserId), channelId: conversation.channelId, recipientPhone,
        provider: channel.provider as PreparedMessageSend['provider'], providerChannelId: channel.providerChannelId,
        credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag },
      };
    });
  }

  async updateMessageDelivery(input: ConversationMessageDeliveryDto): Promise<MessageRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [row] = await transaction.update(messages).set({ deliveryState: input.deliveryState, externalMessageId: input.externalMessageId })
        .where(and(eq(messages.id, input.messageId), eq(messages.organizationId, input.organizationId))).returning({ id: messages.id, conversationId: messages.conversationId, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      if (!row) return null;
      const [actor] = row.actorUserId ? await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, row.actorUserId)).limit(1) : [];
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: `conversation.message_${input.deliveryState}`, entityType: 'conversation', entityId: row.conversationId, correlationId: input.correlationId, afterState: { messageId: row.id, deliveryState: input.deliveryState, externalMessageId: input.externalMessageId } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: row.conversationId, occurredAt: row.occurredAt.toISOString() })})`);
      return new MessageRecordDto(row.id, row.direction, row.actorType, row.bodyText, row.deliveryState, row.occurredAt.toISOString(), row.actorUserId, actor?.name ?? null);
    });
  }
}
