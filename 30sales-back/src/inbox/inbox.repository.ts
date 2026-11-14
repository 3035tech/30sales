import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, auditEvents, conversations, messages, messagingChannels, people } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { ChannelRecordDto } from '../channels/channels.dto';
import { ConversationAssignDto, ConversationAssigneeDto, ConversationAutomationUpdateDto, ConversationControlDto, ConversationControlResultDto, ConversationListItemDto, ConversationMessagesQueryDto, ConversationRepositoryListDto, MessageRecordDto } from './inbox.dto';

@Injectable()
export class InboxRepository {
  async listAssignees(organizationId: string): Promise<ConversationAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name, role: authMember.role }).from(authMember)
      .innerJoin(authUser, eq(authUser.id, authMember.userId)).where(and(eq(authMember.organizationId, organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY['owner','admin','manager','bdr','sdr','closer']::text[]`)).orderBy(asc(authUser.name));
    return rows.map((row) => new ConversationAssigneeDto(row.id, row.name, row.role));
  }

  async list(input: ConversationRepositoryListDto): Promise<ConversationListItemDto[]> {
    const conditions = [eq(conversations.organizationId, input.organizationId)];
    if (input.query.status) conditions.push(eq(conversations.status, input.query.status));
    if (input.query.channelId) conditions.push(eq(conversations.channelId, input.query.channelId));
    const rows = await database.select({ id: conversations.id, provider: conversations.provider, status: conversations.status, accountName: accounts.name, personName: people.name, lastMessageAt: conversations.lastMessageAt, createdAt: conversations.createdAt, channelId: conversations.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, channelProvider: messagingChannels.provider, ownerUserId: conversations.ownerUserId, ownerName: authUser.name, automationMode: conversations.automationMode })
      .from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .leftJoin(authMember, and(eq(authMember.organizationId, conversations.organizationId), eq(authMember.userId, conversations.ownerUserId)))
      .leftJoin(authUser, eq(authUser.id, authMember.userId))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id))
      .limit(input.query.limit).offset(input.query.offset);
    return rows.map((row) => new ConversationListItemDto(row.id, row.provider, row.status, row.accountName, row.personName, row.lastMessageAt?.toISOString() ?? null, row.createdAt.toISOString(), row.channelId, row.channelName, row.channelPhoneNumber, row.channelProvider, row.ownerUserId, row.ownerName, row.automationMode as ConversationListItemDto['automationMode']));
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
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, updated.automationMode as ConversationControlResultDto['automationMode']);
    });
  }

  async listChannels(organizationId: string): Promise<ChannelRecordDto[]> {
    const rows = await database.select().from(messagingChannels).where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.isActive, true))).orderBy(messagingChannels.displayName, messagingChannels.id);
    return rows.map((row) => new ChannelRecordDto(row.id, row.provider as ChannelRecordDto['provider'], row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.createdAt.toISOString(), row.updatedAt.toISOString()));
  }

  async listMessages(input: ConversationMessagesQueryDto): Promise<MessageRecordDto[] | null> {
    const [conversation] = await database.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1);
    if (!conversation) return null;
    const rows = await database.select({ id: messages.id, direction: messages.direction, actorType: messages.actorType, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt })
      .from(messages).where(and(eq(messages.conversationId, input.conversationId), eq(messages.organizationId, input.organizationId)))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(input.limit).offset(input.offset);
    return rows.reverse().map((row) => new MessageRecordDto(row.id, row.direction, row.actorType, row.bodyText, row.deliveryState, row.occurredAt.toISOString()));
  }
}
