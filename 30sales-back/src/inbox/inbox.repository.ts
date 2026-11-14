import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, conversations, messages, messagingChannels, people } from '../db/schema';
import { ChannelRecordDto } from '../channels/channels.dto';
import { ConversationListItemDto, ConversationMessagesQueryDto, ConversationRepositoryListDto, MessageRecordDto } from './inbox.dto';

@Injectable()
export class InboxRepository {
  async list(input: ConversationRepositoryListDto): Promise<ConversationListItemDto[]> {
    const conditions = [eq(conversations.organizationId, input.organizationId)];
    if (input.query.status) conditions.push(eq(conversations.status, input.query.status));
    if (input.query.channelId) conditions.push(eq(conversations.channelId, input.query.channelId));
    const rows = await database.select({ id: conversations.id, provider: conversations.provider, status: conversations.status, accountName: accounts.name, personName: people.name, lastMessageAt: conversations.lastMessageAt, createdAt: conversations.createdAt, channelId: conversations.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, channelProvider: messagingChannels.provider })
      .from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id))
      .limit(input.query.limit).offset(input.query.offset);
    return rows.map((row) => new ConversationListItemDto(row.id, row.provider, row.status, row.accountName, row.personName, row.lastMessageAt?.toISOString() ?? null, row.createdAt.toISOString(), row.channelId, row.channelName, row.channelPhoneNumber, row.channelProvider));
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
