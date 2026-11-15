import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { database, pool } from '../db';
import { agentSettings, auditEvents, conversations, messages, messagingChannels, outboxEvents, people } from '../db/schema';
import type { ProviderSendResult } from '../inbox/whatsapp-text-provider.service';
import { sofiaInboundEventSchema, type SofiaInboundEventDto, type SofiaQueueEventDto, type SofiaRuntimeContextDto } from './sofia-runtime.dto';

type AgentSendChannel = { channelId: string; provider: SofiaInboundEventDto['provider']; providerChannelId: string; recipientPhone: string; credentials: { ciphertext: string; iv: string; authTag: string } };

@Injectable()
export class SofiaRuntimeRepository {
  async claimNextEvent(): Promise<SofiaQueueEventDto | null> {
    const result = await pool.query<{ id: string; organizationId: string; payload: unknown; attempts: number }>(`
      WITH next_event AS (
        SELECT id FROM outbox_events
        WHERE event_type = 'agent.inbound_message_received'
          AND status = 'pending' AND available_at <= now()
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE outbox_events AS event
      SET available_at = now() + interval '90 seconds', attempts = event.attempts + 1
      FROM next_event
      WHERE event.id = next_event.id
      RETURNING event.id, event.organization_id AS "organizationId", event.payload, event.attempts::int AS attempts
    `);
    return result.rows[0] ?? null;
  }

  async loadContext(queueEvent: SofiaQueueEventDto): Promise<SofiaRuntimeContextDto | null> {
    const payload = sofiaInboundEventSchema.safeParse(queueEvent.payload);
    if (!payload.success || payload.data.organizationId !== queueEvent.organizationId) return null;
    const event = payload.data;
    const [context] = await database.select({
      conversationId: conversations.id, channelId: conversations.channelId, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId,
      provider: conversations.provider, channelActive: messagingChannels.isActive, personPhone: people.phone,
      enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt,
    }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .innerJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .innerJoin(agentSettings, and(eq(agentSettings.organizationId, conversations.organizationId), eq(agentSettings.agentKey, 'sofia')))
      .where(and(eq(conversations.id, event.conversationId), eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, event.channelId))).limit(1);
    if (!context || context.provider !== event.provider || !context.channelActive) return null;

    const [latestInbound] = await database.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.organizationId, event.organizationId), eq(messages.conversationId, event.conversationId), eq(messages.direction, 'inbound')))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(1);
    if (!latestInbound || latestInbound.id !== event.messageId) return null;

    const history = await database.select({ direction: messages.direction, bodyText: messages.bodyText }).from(messages)
      .where(and(eq(messages.organizationId, event.organizationId), eq(messages.conversationId, event.conversationId), sql`${messages.direction} in ('inbound', 'outbound')`))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(30);
    const historyMessages = history.reverse().flatMap((message) => message.bodyText ? [{ role: message.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: message.bodyText }] : []);
    const firstUserMessage = historyMessages.findIndex((message) => message.role === 'user');
    if (firstUserMessage < 0) return null;
    const recentMessages = historyMessages.slice(firstUserMessage).reduce<typeof historyMessages>((combined, message) => {
      const previous = combined.at(-1);
      if (previous?.role === message.role) previous.content = `${previous.content}\n${message.content}`;
      else combined.push({ ...message });
      return combined;
    }, []);
    if (recentMessages.at(-1)?.role !== 'user') return null;
    return {
      event, enabled: context.enabled, model: context.model, systemPrompt: context.systemPrompt, automationMode: context.automationMode, ownerUserId: context.ownerUserId,
      recipientPhone: (context.personPhone ?? '').replace(/\D/g, ''), messages: recentMessages,
    };
  }

  async sendIfStillAutomated(input: { queueEventId: string; context: SofiaRuntimeContextDto; replyText: string; send: (channel: AgentSendChannel) => Promise<ProviderSendResult> }): Promise<'sent' | 'skipped'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, organizationId: conversations.organizationId, channelId: conversations.channelId, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, input.context.event.conversationId), eq(conversations.organizationId, input.context.event.organizationId))).for('update').limit(1);
      if (!conversation || conversation.automationMode !== 'sofia' || conversation.ownerUserId || conversation.channelId !== input.context.event.channelId) return 'skipped';

      const [agent] = await transaction.select({ enabled: agentSettings.enabled }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, conversation.organizationId), eq(agentSettings.agentKey, 'sofia'))).limit(1);
      if (!agent?.enabled) return 'skipped';

      const [latestInbound] = await transaction.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.organizationId, conversation.organizationId), eq(messages.conversationId, conversation.id), eq(messages.direction, 'inbound')))
        .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(1);
      if (latestInbound?.id !== input.context.event.messageId) return 'skipped';

      const [channel] = await transaction.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).where(and(eq(messagingChannels.id, conversation.channelId), eq(messagingChannels.organizationId, conversation.organizationId))).limit(1);
      if (!channel?.isActive || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag || channel.provider !== input.context.event.provider) return 'skipped';

      const delivery = await input.send({ channelId: channel.id, provider: channel.provider as AgentSendChannel['provider'], providerChannelId: channel.providerChannelId, recipientPhone: input.context.recipientPhone, credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag } });
      const occurredAt = new Date();
      const idempotencyKey = `sofia-reply:${input.context.event.messageId}`;
      const [message] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'outbound', actorType: 'assistant', bodyText: input.replyText, deliveryState: delivery.deliveryState, externalMessageId: delivery.externalMessageId, idempotencyKey, occurredAt })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      if (message) {
        await transaction.update(conversations).set({ lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${occurredAt}), ${occurredAt})`, updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
      const action = delivery.deliveryState === 'failed' ? 'conversation.sofia_reply_failed' : delivery.deliveryState === 'unknown' ? 'conversation.sofia_reply_delivery_unknown' : 'conversation.sofia_reply_sent';
      await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action, entityType: 'conversation', entityId: conversation.id, afterState: { messageId: message.id, sourceMessageId: input.context.event.messageId, deliveryState: delivery.deliveryState } });
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
      }
      await transaction.update(outboxEvents).set({ status: 'published', publishedAt: occurredAt, lastErrorCode: null }).where(and(eq(outboxEvents.id, input.queueEventId), eq(outboxEvents.organizationId, conversation.organizationId), eq(outboxEvents.status, 'pending')));
      return 'sent';
    });
  }

  async completeEvent(eventId: string): Promise<void> {
    await pool.query("UPDATE outbox_events SET status = 'published', published_at = now(), last_error_code = null WHERE id = $1 AND status = 'pending'", [eventId]);
  }

  async retryOrFail(queueEvent: SofiaQueueEventDto, errorCode: string, retryable: boolean): Promise<boolean> {
    const terminal = !retryable || queueEvent.attempts >= 5;
    const delaySeconds = Math.min(300, queueEvent.attempts * queueEvent.attempts * 10);
    const result = await pool.query(`UPDATE outbox_events SET status = $2, available_at = now() + ($3::int * interval '1 second'), last_error_code = $4 WHERE id = $1 AND status = 'pending'`, [queueEvent.id, terminal ? 'failed' : 'pending', terminal ? 0 : delaySeconds, errorCode]);
    if (terminal && result.rowCount === 1) await this.recordFailureNotice(queueEvent, errorCode);
    return terminal && result.rowCount === 1;
  }

  private async recordFailureNotice(queueEvent: SofiaQueueEventDto, errorCode: string): Promise<void> {
    const payload = sofiaInboundEventSchema.safeParse(queueEvent.payload);
    if (!payload.success || payload.data.organizationId !== queueEvent.organizationId) return;
    const event = payload.data;
    await database.transaction(async (transaction) => {
      const [notice] = await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: event.conversationId, direction: 'internal', actorType: 'system', bodyText: 'Sofia could not prepare an automatic reply. A teammate needs to review this conversation.', deliveryState: 'unknown', idempotencyKey: `sofia-failure:${queueEvent.id}`, occurredAt: new Date() })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      if (!notice) return;
      await transaction.insert(auditEvents).values({ organizationId: event.organizationId, actorType: 'system', action: 'conversation.sofia_runtime_failed', entityType: 'conversation', entityId: event.conversationId, afterState: { messageId: notice.id, sourceMessageId: event.messageId, errorCode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: event.conversationId, occurredAt: new Date().toISOString() })})`);
    });
  }
}
