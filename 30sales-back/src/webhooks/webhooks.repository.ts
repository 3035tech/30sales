import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { conversations, inboxEvents, leads, messages, messagingChannels, opportunities, people } from '../db/schema';
import type { WebhookChannelDto } from './webhooks.dto';
import { IncomingWhatsappMessageDto, WhatsappMessageStatusDto } from './webhooks.dto';

@Injectable()
export class WebhooksRepository {
  async findEvolutionChannel(channelId: string): Promise<WebhookChannelDto | null> {
    const [row] = await database.select({ id: messagingChannels.id, organizationId: messagingChannels.organizationId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.provider, 'evolution'))).limit(1);
    return row ?? null;
  }

  async findCloudChannel(phoneNumberId: string): Promise<WebhookChannelDto | null> {
    const rows = await database.select({ id: messagingChannels.id, organizationId: messagingChannels.organizationId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.providerChannelId, phoneNumberId), eq(messagingChannels.provider, 'whatsapp_cloud_api'))).limit(2);
    return rows.length === 1 ? rows[0] : null;
  }

  async recordIncomingMessage(input: IncomingWhatsappMessageDto): Promise<'created' | 'duplicate'> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.insert(inboxEvents).values({ organizationId: input.organizationId, provider: input.provider, externalEventId: input.externalMessageId, eventType: 'messages.upsert', payloadHash: input.payloadHash, payloadRedacted: { messageType: input.messageType, direction: 'inbound' }, status: 'processed', attempts: '1', processedAt: new Date() })
        .onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
      if (!event) return 'duplicate';

      const lockKey = `${input.organizationId}:${input.senderPhone}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}), 0)`);
      const normalizedStoredPhone = sql`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')`;
      let [person] = await transaction.select({ id: people.id }).from(people)
        .where(and(eq(people.organizationId, input.organizationId), sql`${normalizedStoredPhone} = ${input.senderPhone}`)).orderBy(people.createdAt, people.id).limit(1);
      if (!person) {
        const [createdPerson] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.senderName?.trim().slice(0, 160) || input.senderPhone, phone: `+${input.senderPhone}` }).returning({ id: people.id });
        person = createdPerson;
      }
      if (!person) throw new Error('Incoming WhatsApp message could not resolve its contact.');

      const [lead] = await transaction.select({ accountId: leads.accountId, opportunityId: opportunities.id }).from(leads)
        .leftJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), eq(leads.personId, person.id))).orderBy(desc(leads.createdAt), desc(leads.id)).limit(1);

      const [conversation] = await transaction.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.provider, input.provider), eq(conversations.externalConversationId, input.externalConversationId))).for('update').limit(1);
      let conversationId = conversation?.id;
      if (!conversationId) {
        const [createdConversation] = await transaction.insert(conversations).values({ organizationId: input.organizationId, provider: input.provider, externalConversationId: input.externalConversationId, channelId: input.channelId, accountId: lead?.accountId ?? null, personId: person.id, opportunityId: lead?.opportunityId ?? null, status: 'open', ownerUserId: null, automationMode: 'paused', lastMessageAt: input.occurredAt }).returning({ id: conversations.id });
        conversationId = createdConversation.id;
      }

      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId, externalMessageId: input.externalMessageId, direction: 'inbound', actorType: 'contact', bodyText: input.bodyText, deliveryState: 'received', occurredAt: input.occurredAt })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.externalMessageId] }).returning({ id: messages.id });
      if (message) await transaction.update(conversations).set({ status: 'open', lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${input.occurredAt}), ${input.occurredAt})`, updatedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, input.organizationId)));
      return message ? 'created' : 'duplicate';
    });
  }

  async recordMessageStatus(input: WhatsappMessageStatusDto): Promise<'updated' | 'duplicate' | 'unmatched' | 'unchanged'> {
    return database.transaction(async (transaction) => {
      const [message] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, deliveryState: messages.deliveryState })
        .from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.externalMessageId, input.externalMessageId), eq(messages.direction, 'outbound'), eq(conversations.provider, input.provider), eq(conversations.channelId, input.channelId)))
        .for('update').limit(1);
      if (!message) return 'unmatched';

      const [event] = await transaction.insert(inboxEvents).values({ organizationId: input.organizationId, provider: input.provider, externalEventId: input.externalEventId, eventType: 'messages.status', payloadHash: input.payloadHash, payloadRedacted: { messageId: message.id, deliveryState: input.deliveryState }, status: 'processed', attempts: '1', processedAt: new Date() })
        .onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
      if (!event) return 'duplicate';

      const current = message.deliveryState;
      const next = this.nextDeliveryState(current, input.deliveryState);
      if (!next) return 'unchanged';
      await transaction.update(messages).set({ deliveryState: next })
        .where(and(eq(messages.id, message.id), eq(messages.organizationId, input.organizationId)));
      return 'updated';
    });
  }

  private nextDeliveryState(current: string, incoming: 'accepted' | 'delivered' | 'read' | 'failed'): 'accepted' | 'delivered' | 'read' | 'failed' | null {
    if (current === incoming || current === 'read' || current === 'failed') return null;
    if (incoming === 'failed') return current === 'requested' || current === 'accepted' || current === 'unknown' ? 'failed' : null;
    const rank: Record<string, number> = { requested: 0, unknown: 0, accepted: 1, delivered: 2, read: 3 };
    return (rank[incoming] ?? -1) > (rank[current] ?? -1) ? incoming : null;
  }
}
