import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { agentSettings, auditEvents, closerEventSlaPolicies, closerEvents, conversations, externalRecords, handoffs, inboxEvents, leadContacts, leads, messageAttachments, messages, messagingChannels, opportunities, outboxEvents, people, userNotifications } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import type { WebhookChannelDto } from './webhooks.dto';
import { IncomingWhatsappMessageDto, InterpretationFailureSignalDto, ProviderWebhookEventDto, WhatsappMessageStatusDto } from './webhooks.dto';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES } from '../auth/authorization.constants';
import { INBOX_ACTIVE_CONVERSATION_STATUSES } from '../inbox/inbox.constants';
import { META_EXTERNAL_RECORD_TYPE, PROVIDER_EVENT_FAMILY } from './provider-webhook-events.constants';

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

  async findCloudAccountChannel(accountId: string): Promise<WebhookChannelDto | null> {
    const rows = await database.select({ id: messagingChannels.id, organizationId: messagingChannels.organizationId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.providerAccountId, accountId), eq(messagingChannels.provider, 'whatsapp_cloud_api'))).limit(2);
    return rows.length === 1 ? rows[0] : null;
  }

  async recordProviderEvent(input: ProviderWebhookEventDto): Promise<'created' | 'duplicate'> {
    const [event] = await database.insert(inboxEvents).values({
      organizationId: input.organizationId,
      provider: input.provider,
      externalEventId: input.externalEventId,
      eventType: input.eventType,
      payloadHash: input.payloadHash,
      payloadRedacted: { channelId: input.channelId, eventFamily: input.eventFamily },
      status: 'processed',
      attempts: '1',
      processedAt: new Date(),
    }).onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
    return event ? 'created' : 'duplicate';
  }

  async findChannel(channelId: string): Promise<WebhookChannelDto | null> {
    const [row] = await database.select({ id: messagingChannels.id, organizationId: messagingChannels.organizationId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(eq(messagingChannels.id, channelId)).limit(1);
    return row ?? null;
  }

  async recordInterpretationFailure(input: InterpretationFailureSignalDto): Promise<'created' | 'escalated' | 'already_urgent' | 'duplicate' | 'unmatched' | 'unroutable'> {
    return database.transaction(async (transaction) => {
      const [source] = await transaction.select({ messageId: messages.id, conversationId: conversations.id, opportunityId: conversations.opportunityId, occurredAt: messages.occurredAt, bodyText: messages.bodyText })
        .from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.externalMessageId, input.input.externalMessageId), eq(messages.direction, 'inbound'), eq(conversations.channelId, input.channelId), eq(conversations.provider, input.provider), eq(conversations.externalConversationId, input.input.externalConversationId))).limit(1);
      if (!source) return 'unmatched';
      if (!source.opportunityId) return 'unroutable';

      const [slaPolicy] = await transaction.select({ targetMinutes: closerEventSlaPolicies.targetMinutes, escalateToManagers: closerEventSlaPolicies.escalateToManagers }).from(closerEventSlaPolicies)
        .where(and(eq(closerEventSlaPolicies.organizationId, input.organizationId), eq(closerEventSlaPolicies.eventType, 'interpretation_failure'))).limit(1);
      const dueAt = slaPolicy ? new Date(source.occurredAt.getTime() + slaPolicy.targetMinutes * 60_000) : null;
      const slaEscalateToManagers = slaPolicy?.escalateToManagers ?? false;

      const [opportunity] = await transaction.select({ ownerUserId: opportunities.ownerUserId, stage: opportunities.stage }).from(opportunities)
        .where(and(eq(opportunities.id, source.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
      if (!opportunity?.ownerUserId || ['won', 'lost'].includes(opportunity.stage)) return 'unroutable';
      const [acceptedHandoff] = await transaction.select({ id: handoffs.id }).from(handoffs)
        .where(and(eq(handoffs.organizationId, input.organizationId), eq(handoffs.opportunityId, source.opportunityId), eq(handoffs.status, 'accepted'))).limit(1);
      const [membership] = await transaction.select({ role: authMember.role }).from(authMember)
        .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, opportunity.ownerUserId))).limit(1);
      const hasCloserRole = membership ? hasOrganizationRole(membership.role, ORGANIZATION_CLOSER_ROLES) : false;
      if (!acceptedHandoff && !hasCloserRole) return 'unroutable';

      const externalEventId = 'agent.interpretation_failure:' + input.channelId + ':' + input.input.externalMessageId;
      const [inboxEvent] = await transaction.insert(inboxEvents).values({ organizationId: input.organizationId, provider: input.provider, externalEventId, eventType: 'agent.interpretation_failure', payloadHash: input.payloadHash, payloadRedacted: { channelId: input.channelId, eventFamily: PROVIDER_EVENT_FAMILY.message, sourceMessageId: source.messageId }, status: 'processed', attempts: '1', processedAt: new Date() })
        .onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
      if (!inboxEvent) return 'duplicate';

      const idempotencyKey = 'lead-reply:' + source.messageId;
      const [existing] = await transaction.select({ id: closerEvents.id, eventType: closerEvents.eventType }).from(closerEvents)
        .where(and(eq(closerEvents.organizationId, input.organizationId), eq(closerEvents.idempotencyKey, idempotencyKey))).limit(1);
      let eventId = existing?.id;
      const outcome: 'created' | 'escalated' = existing ? 'escalated' : 'created';
      if (existing?.eventType === 'human_requested') return 'already_urgent';
      const summary = input.input.reason;
      if (existing) {
        await transaction.update(closerEvents).set({ eventType: 'interpretation_failure', priority: 'urgent', status: 'new', summary, dueAt, slaNotifiedAt: null, slaEscalateToManagers, acknowledgedAt: null, snoozedUntil: null, resolvedAt: null, updatedAt: new Date() })
          .where(and(eq(closerEvents.id, existing.id), eq(closerEvents.organizationId, input.organizationId)));
      } else {
        const [created] = await transaction.insert(closerEvents).values({ organizationId: input.organizationId, eventType: 'interpretation_failure', priority: 'urgent', status: 'new', idempotencyKey, conversationId: source.conversationId, opportunityId: source.opportunityId, sourceMessageId: source.messageId, assignedToUserId: opportunity.ownerUserId, summary, evidence: source.bodyText, occurredAt: source.occurredAt, dueAt, slaEscalateToManagers }).returning({ id: closerEvents.id });
        eventId = created.id;
      }
      if (eventId) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'system', action: existing ? 'closer_event.escalated' : 'closer_event.created', entityType: 'closer_event', entityId: eventId, afterState: { eventType: 'interpretation_failure', priority: 'urgent', conversationId: source.conversationId, opportunityId: source.opportunityId, sourceMessageId: source.messageId, assignedToUserId: opportunity.ownerUserId, reason: input.input.reason } });
      return outcome;
    });
  }

  async recordIncomingMessage(input: IncomingWhatsappMessageDto): Promise<'created' | 'duplicate'> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.insert(inboxEvents).values({ organizationId: input.organizationId, provider: input.provider, externalEventId: input.externalMessageId, eventType: 'messages.upsert', payloadHash: input.payloadHash, payloadRedacted: { channelId: input.channelId, eventFamily: 'message', messageType: input.messageType, direction: 'inbound' }, status: 'processed', attempts: '1', processedAt: new Date() })
        .onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
      if (!event) return 'duplicate';

      const externalRecordId = input.senderExternalId ? `${input.channelId}:${input.senderExternalId}` : null;
      const lockKey = `${input.organizationId}:${input.channelId}:${externalRecordId ?? input.senderPhone ?? input.externalMessageId}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}), 0)`);
      const normalizedStoredPhone = sql`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')`;
      let [person] = externalRecordId ? await transaction.select({ id: people.id, phone: people.phone }).from(externalRecords)
        .innerJoin(people, and(eq(people.id, externalRecords.personId), eq(people.organizationId, externalRecords.organizationId)))
        .where(and(eq(externalRecords.organizationId, input.organizationId), eq(externalRecords.provider, input.provider), eq(externalRecords.recordType, META_EXTERNAL_RECORD_TYPE.businessScopedUserId), eq(externalRecords.externalId, externalRecordId))).limit(1) : [];
      if (!person && input.senderPhone) [person] = await transaction.select({ id: people.id, phone: people.phone }).from(people)
        .where(and(eq(people.organizationId, input.organizationId), sql`${normalizedStoredPhone} = ${input.senderPhone}`)).orderBy(people.createdAt, people.id).limit(1);
      if (!person) {
        const [createdPerson] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.senderName?.trim().slice(0, 160) || input.senderPhone || input.senderExternalId || input.externalMessageId, phone: input.senderPhone ? `+${input.senderPhone}` : null }).returning({ id: people.id, phone: people.phone });
        person = createdPerson;
      }
      if (!person) throw new Error('Incoming WhatsApp message could not resolve its contact.');
      if (!person.phone && input.senderPhone) {
        const [updatedPerson] = await transaction.update(people).set({ phone: `+${input.senderPhone}`, updatedAt: new Date() })
          .where(and(eq(people.id, person.id), eq(people.organizationId, input.organizationId))).returning({ id: people.id, phone: people.phone });
        person = updatedPerson ?? person;
      }
      if (externalRecordId) await transaction.insert(externalRecords).values({ organizationId: input.organizationId, provider: input.provider, recordType: META_EXTERNAL_RECORD_TYPE.businessScopedUserId, externalId: externalRecordId, personId: person.id, payloadHash: input.payloadHash })
        .onConflictDoUpdate({ target: [externalRecords.organizationId, externalRecords.provider, externalRecords.recordType, externalRecords.externalId], set: { lastSeenAt: new Date(), payloadHash: input.payloadHash } });

      const [lead] = await transaction.select({ accountId: leads.accountId, opportunityId: opportunities.id }).from(leads)
        .leftJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), or(eq(leads.personId, person.id), eq(leadContacts.personId, person.id)))).orderBy(desc(leads.createdAt), desc(leads.id)).limit(1);

      let [conversation] = await transaction.select({ id: conversations.id, opportunityId: conversations.opportunityId, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.provider, input.provider), eq(conversations.externalConversationId, input.externalConversationId))).for('update').limit(1);
      if (!conversation) {
        [conversation] = await transaction.select({ id: conversations.id, opportunityId: conversations.opportunityId, ownerUserId: conversations.ownerUserId }).from(conversations)
          .where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.provider, input.provider), eq(conversations.channelId, input.channelId), eq(conversations.personId, person.id), inArray(conversations.status, INBOX_ACTIVE_CONVERSATION_STATUSES)))
          .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt)).for('update').limit(1);
      }
      let conversationId = conversation?.id;
      let opportunityId = conversation?.opportunityId ?? lead?.opportunityId ?? null;
      let notificationRecipientUserId = conversation?.ownerUserId ?? null;
      if (!conversationId) {
        const [agent] = await transaction.select({ enabled: agentSettings.enabled }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, 'assistant'))).limit(1);
        const [createdConversation] = await transaction.insert(conversations).values({ organizationId: input.organizationId, provider: input.provider, externalConversationId: input.externalConversationId, channelId: input.channelId, accountId: lead?.accountId ?? null, personId: person.id, opportunityId: lead?.opportunityId ?? null, status: 'open', ownerUserId: null, automationMode: agent?.enabled ? 'assistant' : 'paused', lastMessageAt: input.occurredAt }).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId });
        conversationId = createdConversation.id;
        notificationRecipientUserId = createdConversation.ownerUserId;
        opportunityId = lead?.opportunityId ?? null;
      }

      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId, externalMessageId: input.externalMessageId, direction: 'inbound', actorType: 'contact', bodyText: input.bodyText, deliveryState: 'received', occurredAt: input.occurredAt })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.externalMessageId] }).returning({ id: messages.id });
      if (message) {
        if (input.media) await transaction.insert(messageAttachments).values({
          organizationId: input.organizationId,
          messageId: message.id,
          channelId: input.channelId,
          provider: input.provider,
          mediaType: input.media.mediaType,
          sourceMediaId: input.media.sourceMediaId,
          sourceCiphertext: input.media.sourceCiphertext,
          sourceIv: input.media.sourceIv,
          sourceAuthTag: input.media.sourceAuthTag,
          mimeType: input.media.mimeType,
          fileName: input.media.fileName,
          sizeBytes: input.media.sizeBytes,
          sha256: input.media.sha256,
        });
        await transaction.update(conversations).set({ status: 'open', lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${input.occurredAt}), ${input.occurredAt})`, updatedAt: new Date() })
          .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, input.organizationId)));
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId, occurredAt: input.occurredAt.toISOString() })})`);
        await transaction.insert(outboxEvents).values({
          organizationId: input.organizationId,
          eventType: 'agent.inbound_message_received',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          idempotencyKey: `agent-inbound:${message.id}`,
          availableAt: new Date(Date.now() + 5000),
          payload: {
            organizationId: input.organizationId,
            channelId: input.channelId,
            conversationId,
            messageId: message.id,
            provider: input.provider,
            externalConversationId: input.externalConversationId,
            externalMessageId: input.externalMessageId,
            messageType: input.messageType,
            occurredAt: input.occurredAt.toISOString(),
          },
        }).onConflictDoNothing({ target: [outboxEvents.organizationId, outboxEvents.idempotencyKey] });
        if (opportunityId) {
          const [opportunity] = await transaction.select({ ownerUserId: opportunities.ownerUserId, stage: opportunities.stage }).from(opportunities)
            .where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
          const [acceptedHandoff] = await transaction.select({ id: handoffs.id }).from(handoffs)
            .innerJoin(opportunities, and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, handoffs.organizationId)))
            .where(and(eq(handoffs.organizationId, input.organizationId), eq(handoffs.opportunityId, opportunityId), eq(handoffs.status, 'accepted'))).limit(1);
          const activeOpportunity = Boolean(opportunity?.ownerUserId && !['won', 'lost'].includes(opportunity.stage));
          if (!notificationRecipientUserId && activeOpportunity) notificationRecipientUserId = opportunity?.ownerUserId ?? null;
          let closerMembership = false;
          if (opportunity?.ownerUserId) {
            const [membership] = await transaction.select({ id: authMember.id }).from(authMember)
              .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, opportunity.ownerUserId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`)).limit(1);
            closerMembership = Boolean(membership);
          }
          const isCloserOwned = activeOpportunity && closerMembership;
          const hasAcceptedHandoff = Boolean(acceptedHandoff && activeOpportunity);
          const eventType = input.closerSignal === 'human_requested' && (hasAcceptedHandoff || isCloserOwned) ? 'human_requested'
            : input.closerSignal === 'buying_intent' && (hasAcceptedHandoff || isCloserOwned) ? 'buying_intent'
              : input.closerSignal === 'question' && (hasAcceptedHandoff || isCloserOwned) ? 'closer_question'
              : hasAcceptedHandoff ? 'lead_replied_after_handoff' : null;
          const assignedToUserId = activeOpportunity ? opportunity?.ownerUserId : null;
          if (eventType && assignedToUserId) {
            const priority = eventType === 'human_requested' ? 'urgent' : 'high';
            const summary = eventType === 'human_requested' ? 'The lead explicitly asked to speak with a person.' : eventType === 'buying_intent' ? 'The lead showed concrete intent to move forward.' : eventType === 'closer_question' ? 'The lead asked a question while the closer owns the opportunity.' : 'The lead replied after the handoff was accepted.';
            const [slaPolicy] = await transaction.select({ targetMinutes: closerEventSlaPolicies.targetMinutes, escalateToManagers: closerEventSlaPolicies.escalateToManagers }).from(closerEventSlaPolicies)
              .where(and(eq(closerEventSlaPolicies.organizationId, input.organizationId), eq(closerEventSlaPolicies.eventType, eventType))).limit(1);
            const dueAt = slaPolicy ? new Date(input.occurredAt.getTime() + slaPolicy.targetMinutes * 60_000) : null;
            const [closerEvent] = await transaction.insert(closerEvents).values({ organizationId: input.organizationId, eventType, priority, status: 'new', idempotencyKey: `lead-reply:${message.id}`, conversationId, opportunityId, sourceMessageId: message.id, assignedToUserId, summary, evidence: input.bodyText, occurredAt: input.occurredAt, dueAt, slaEscalateToManagers: slaPolicy?.escalateToManagers ?? false })
              .onConflictDoNothing({ target: [closerEvents.organizationId, closerEvents.idempotencyKey] }).returning({ id: closerEvents.id });
            if (closerEvent) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'system', action: 'closer_event.created', entityType: 'closer_event', entityId: closerEvent.id, afterState: { eventType, priority, conversationId, opportunityId, sourceMessageId: message.id, assignedToUserId } });
          }
        }
        if (notificationRecipientUserId) {
          const [recipientMembership] = await transaction.select({ userId: authMember.userId }).from(authMember)
            .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, notificationRecipientUserId))).limit(1);
          if (recipientMembership) await transaction.insert(userNotifications).values({
            organizationId: input.organizationId,
            recipientUserId: notificationRecipientUserId,
            conversationId,
            notificationType: 'inbox_new_message',
            idempotencyKey: `inbox-new-message:${message.id}`,
          }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
        }
      }
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

      const [event] = await transaction.insert(inboxEvents).values({ organizationId: input.organizationId, provider: input.provider, externalEventId: input.externalEventId, eventType: 'messages.status', payloadHash: input.payloadHash, payloadRedacted: { channelId: input.channelId, eventFamily: PROVIDER_EVENT_FAMILY.message, messageId: message.id, deliveryState: input.deliveryState }, status: 'processed', attempts: '1', processedAt: new Date() })
        .onConflictDoNothing({ target: [inboxEvents.organizationId, inboxEvents.provider, inboxEvents.externalEventId] }).returning({ id: inboxEvents.id });
      if (!event) return 'duplicate';

      const current = message.deliveryState;
      const next = this.nextDeliveryState(current, input.deliveryState);
      if (!next) return 'unchanged';
      await transaction.update(messages).set({ deliveryState: next })
        .where(and(eq(messages.id, message.id), eq(messages.organizationId, input.organizationId)));
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: message.conversationId, occurredAt: input.occurredAt.toISOString() })})`);
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
