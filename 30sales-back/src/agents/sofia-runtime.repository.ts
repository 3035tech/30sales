import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { database, pool } from '../db';
import { accounts, agentSettings, auditEvents, closerEvents, conversations, handoffHistory, handoffs, leadStatusHistory, leads, messages, messagingChannels, opportunities, opportunityStageHistory, outboxEvents, people } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import type { ProviderSendResult } from '../inbox/whatsapp-text-provider.service';
import { sofiaInboundEventSchema, type SofiaAgentResponseDto, type SofiaInboundEventDto, type SofiaQueueEventDto, type SofiaRuntimeContextDto } from './sofia-runtime.dto';

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
    const recentMessages = historyMessages.slice(Math.max(firstUserMessage, 0)).reduce<typeof historyMessages>((combined, message) => {
      const previous = combined.at(-1);
      if (previous?.role === message.role) previous.content = `${previous.content}\n${message.content}`;
      else combined.push({ ...message });
      return combined;
    }, []);
    return {
      event, enabled: context.enabled, model: context.model, systemPrompt: context.systemPrompt, automationMode: context.automationMode, ownerUserId: context.ownerUserId,
      recipientPhone: (context.personPhone ?? '').replace(/\D/g, ''), messages: recentMessages,
    };
  }

  async sendIfStillAutomated(input: { queueEventId: string; context: SofiaRuntimeContextDto; result: SofiaAgentResponseDto; send: (channel: AgentSendChannel) => Promise<ProviderSendResult> }): Promise<'sent' | 'skipped'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, organizationId: conversations.organizationId, channelId: conversations.channelId, accountId: conversations.accountId, personId: conversations.personId, opportunityId: conversations.opportunityId, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, input.context.event.conversationId), eq(conversations.organizationId, input.context.event.organizationId))).for('update').limit(1);
      if (!conversation || conversation.automationMode !== 'sofia' || conversation.ownerUserId || conversation.channelId !== input.context.event.channelId) return 'skipped';

      const [agent] = await transaction.select({ enabled: agentSettings.enabled, updatedByUserId: agentSettings.updatedByUserId }).from(agentSettings)
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
      const [message] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'outbound', actorType: 'assistant', bodyText: input.result.replyText, deliveryState: delivery.deliveryState, externalMessageId: delivery.externalMessageId, idempotencyKey, occurredAt })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      if (message) {
        await transaction.update(conversations).set({ lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${occurredAt}), ${occurredAt})`, updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
      const action = delivery.deliveryState === 'failed' ? 'conversation.sofia_reply_failed' : delivery.deliveryState === 'unknown' ? 'conversation.sofia_reply_delivery_unknown' : 'conversation.sofia_reply_sent';
      await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action, entityType: 'conversation', entityId: conversation.id, afterState: { messageId: message.id, sourceMessageId: input.context.event.messageId, deliveryState: delivery.deliveryState } });
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
      }
      await transaction.update(conversations).set({
        sofiaQualificationIntent: input.result.intent,
        sofiaQualificationSummary: input.result.summary,
        sofiaConfirmedFacts: input.result.confirmedFacts,
        sofiaUnknowns: input.result.unknowns,
        sofiaNextStep: input.result.nextStep,
        sofiaQualificationUpdatedAt: occurredAt,
      }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'conversation.sofia_qualification_updated', entityType: 'conversation', entityId: conversation.id, afterState: { intent: input.result.intent, confirmedFactCount: input.result.confirmedFacts.length, unknownCount: input.result.unknowns.length } });

      const requestsCloser = ['meeting_request', 'proposal_request'].includes(input.result.intent);
      if (requestsCloser && agent.updatedByUserId && conversation.personId) {
        const [lead] = await transaction.select({ id: leads.id, status: leads.status, accountId: leads.accountId, personId: leads.personId, accountName: accounts.name, personName: people.name })
          .from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
          .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
          .where(and(eq(leads.organizationId, conversation.organizationId), eq(leads.personId, conversation.personId), conversation.accountId ? eq(leads.accountId, conversation.accountId) : sql`true`))
          .orderBy(desc(leads.createdAt), desc(leads.id)).for('update', { of: leads }).limit(1);
        const ineligibleLeadStatuses = ['invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact'];
        if (lead && !ineligibleLeadStatuses.includes(lead.status)) {
          const [activeHandoff] = await transaction.select({ id: handoffs.id }).from(handoffs)
            .innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
            .where(and(eq(handoffs.organizationId, conversation.organizationId), eq(opportunities.leadId, lead.id), sql`${handoffs.status} in ('requested', 'accepted')`)).limit(1);
          if (!activeHandoff) {
            let opportunityId = conversation.opportunityId;
            let opportunityOwnerUserId: string | null = null;
            if (opportunityId) {
              const [linkedOpportunity] = await transaction.select({ id: opportunities.id, ownerUserId: opportunities.ownerUserId }).from(opportunities)
                .where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, conversation.organizationId), eq(opportunities.leadId, lead.id))).for('update').limit(1);
              if (!linkedOpportunity) opportunityId = null;
              else opportunityOwnerUserId = linkedOpportunity.ownerUserId;
            }
            if (!opportunityId) {
              const [existingOpportunity] = await transaction.select({ id: opportunities.id, ownerUserId: opportunities.ownerUserId }).from(opportunities)
                .where(and(eq(opportunities.organizationId, conversation.organizationId), eq(opportunities.leadId, lead.id))).for('update').limit(1);
              opportunityId = existingOpportunity?.id ?? null;
              opportunityOwnerUserId = existingOpportunity?.ownerUserId ?? null;
            }
            if (!opportunityId) {
              const dueAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);
              const [createdOpportunity] = await transaction.insert(opportunities).values({ organizationId: conversation.organizationId, leadId: lead.id, accountId: lead.accountId, primaryPersonId: lead.personId, name: `${lead.accountName} — ${input.result.summary.slice(0, 100)}`, nextAction: input.result.nextStep, nextActionAt: dueAt, createdByUserId: agent.updatedByUserId }).returning({ id: opportunities.id });
              opportunityId = createdOpportunity.id;
              await transaction.insert(opportunityStageHistory).values({ organizationId: conversation.organizationId, opportunityId, fromStage: null, toStage: 'qualification', actorUserId: agent.updatedByUserId, reason: 'Opportunity created from Sofia qualified handoff.' });
              await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'opportunity.created', entityType: 'opportunity', entityId: opportunityId, afterState: { stage: 'qualification', source: 'sofia_handoff' } });
            }

            const dueAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);
            await transaction.update(opportunities).set({ nextAction: input.result.nextStep, nextActionAt: dueAt, updatedAt: occurredAt }).where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, conversation.organizationId)));
            const [handoff] = await transaction.insert(handoffs).values({ organizationId: conversation.organizationId, opportunityId, reason: input.result.summary, evidence: `Lead requested a ${input.result.intent === 'meeting_request' ? 'meeting or demonstration' : 'proposal'}. Latest message: ${input.context.messages.at(-1)?.content.slice(0, 1500) ?? ''}`, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, nextStep: input.result.nextStep, nextStepAt: dueAt, requestedByUserId: agent.updatedByUserId, requestedByAgent: true }).returning({ id: handoffs.id });
            await transaction.insert(handoffHistory).values({ organizationId: conversation.organizationId, handoffId: handoff.id, event: 'requested', actorUserId: agent.updatedByUserId, note: 'Prepared by Sofia from the qualified conversation.' });
            await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'handoff.requested', entityType: 'handoff', entityId: handoff.id, afterState: { status: 'requested', opportunityId, source: 'sofia' } });
            if (lead.status !== 'converted_to_sdr') {
              if (lead.status !== 'responded') {
                await transaction.update(leads).set({ status: 'responded', updatedAt: occurredAt }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, conversation.organizationId)));
                await transaction.insert(leadStatusHistory).values({ organizationId: conversation.organizationId, leadId: lead.id, fromStatus: lead.status, toStatus: 'responded', changedByUserId: agent.updatedByUserId });
              }
              await transaction.update(leads).set({ status: 'converted_to_sdr', updatedAt: occurredAt }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, conversation.organizationId)));
              await transaction.insert(leadStatusHistory).values({ organizationId: conversation.organizationId, leadId: lead.id, fromStatus: 'responded', toStatus: 'converted_to_sdr', changedByUserId: agent.updatedByUserId });
              await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'lead.status_changed', entityType: 'lead', entityId: lead.id, afterState: { status: 'converted_to_sdr', source: 'sofia_handoff' } });
            }
            await transaction.update(conversations).set({ opportunityId, automationMode: 'human', updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
            const activeCloserLoad = transaction.select({ userId: closerEvents.assignedToUserId, workload: count() }).from(closerEvents)
              .where(and(eq(closerEvents.organizationId, conversation.organizationId), inArray(closerEvents.status, ['new', 'acknowledged', 'snoozed'])))
              .groupBy(closerEvents.assignedToUserId).as('active_closer_load');
            const closerConditions = [eq(authMember.organizationId, conversation.organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY['closer']::text[]`];
            if (opportunityOwnerUserId) closerConditions.push(eq(authMember.userId, opportunityOwnerUserId));
            const [closer] = await transaction.select({ userId: authMember.userId }).from(authMember).leftJoin(activeCloserLoad, eq(activeCloserLoad.userId, authMember.userId))
              .where(and(...closerConditions))
              .orderBy(asc(sql`coalesce(${activeCloserLoad.workload}, 0)`), asc(authMember.createdAt), asc(authMember.userId)).limit(1);
            if (closer) {
              await transaction.insert(closerEvents).values({ organizationId: conversation.organizationId, eventType: 'qualified_handoff', priority: 'high', idempotencyKey: `sofia-qualified-handoff:${input.context.event.messageId}`, conversationId: conversation.id, opportunityId, sourceMessageId: input.context.event.messageId, assignedToUserId: closer.userId, summary: input.result.summary.slice(0, 1000), evidence: input.context.messages.at(-1)?.content.slice(0, 1500) ?? null, occurredAt })
                .onConflictDoNothing({ target: [closerEvents.organizationId, closerEvents.idempotencyKey] });
            }
            const [notice] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'internal', actorType: 'system', bodyText: 'Sofia prepared a qualified handoff for the closer. Review the handoff summary and take ownership of this conversation.', deliveryState: 'unknown', idempotencyKey: `sofia-handoff:${input.context.event.messageId}`, occurredAt })
              .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
            if (notice) await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
          }
        }
      } else if (input.result.intent === 'explicit_human_request') {
        await transaction.update(conversations).set({ automationMode: 'human', updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
        const [notice] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'internal', actorType: 'system', bodyText: 'The lead asked to speak with a person. Sofia paused automated replies so the team can take over.', deliveryState: 'unknown', idempotencyKey: `sofia-human-request:${input.context.event.messageId}`, occurredAt })
          .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
        if (notice) await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
      }
      await transaction.update(outboxEvents).set({ status: 'published', publishedAt: occurredAt, lastErrorCode: null }).where(and(eq(outboxEvents.id, input.queueEventId), eq(outboxEvents.organizationId, conversation.organizationId), eq(outboxEvents.status, 'pending')));
      return 'sent';
    });
  }

  async completeEvent(eventId: string): Promise<void> {
    await pool.query("UPDATE outbox_events SET status = 'published', published_at = now(), last_error_code = null WHERE id = $1 AND status = 'pending'", [eventId]);
  }

  async escalateUnsupportedMessage(queueEvent: SofiaQueueEventDto, event: SofiaInboundEventDto): Promise<void> {
    if (event.organizationId !== queueEvent.organizationId) return;
    await database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, event.conversationId), eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, event.channelId))).for('update').limit(1);
      if (!conversation || conversation.automationMode !== 'sofia' || conversation.ownerUserId) {
        await transaction.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), lastErrorCode: null }).where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, 'pending')));
        return;
      }
      const [latestInbound] = await transaction.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.organizationId, event.organizationId), eq(messages.conversationId, event.conversationId), eq(messages.direction, 'inbound')))
        .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(1);
      if (latestInbound?.id !== event.messageId) {
        await transaction.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), lastErrorCode: null }).where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, 'pending')));
        return;
      }

      const [notice] = await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: event.conversationId, direction: 'internal', actorType: 'system', bodyText: 'Sofia could not interpret this message type. Automation was paused so a teammate can review and reply.', deliveryState: 'unknown', idempotencyKey: `sofia-unsupported:${event.messageId}`, occurredAt: new Date() })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      await transaction.update(conversations).set({ automationMode: 'human', updatedAt: new Date() }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, event.organizationId)));
      if (notice) {
        await transaction.insert(auditEvents).values({ organizationId: event.organizationId, actorType: 'system', action: 'conversation.sofia_unsupported_message', entityType: 'conversation', entityId: event.conversationId, afterState: { messageId: notice.id, sourceMessageId: event.messageId, messageType: event.messageType, automationMode: 'human' } });
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: event.conversationId, occurredAt: new Date().toISOString() })})`);
      }
      await transaction.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), lastErrorCode: null }).where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, 'pending')));
    });
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
