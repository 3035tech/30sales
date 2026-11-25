import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, agentSettings, assistantProfiles, assistantRuns, auditEvents, businessLineMembers, businessLines, channelAssistantScheduleExceptions, channelBusinessHours, closerEventSlaPolicies, closerEvents, conversations, handoffHistory, handoffs, leadContacts, leadStatusHistory, leads, messageAttachments, messages, messagingChannels, opportunities, opportunityConversationContexts, opportunityStageHistory, outboxEvents, people, userNotifications } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import type { ProviderSendResult } from '../inbox/channel-messaging-adapter';
import { assistantInboundEventSchema, type AssistantAgentResponseDto, type AssistantInboundEventDto, type AssistantQueueEventDto, type AssistantRuntimeContextDto } from './assistant-runtime.dto';
import { hasOrganizationRole, ORGANIZATION_CLOSER_ROLES, ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { ASSISTANT_DELIVERY_OUTCOMES, ASSISTANT_PRICING_VERSION, ASSISTANT_PROVIDER_DELIVERY_STATES, ASSISTANT_REPLY_IDEMPOTENCY_PREFIX, ASSISTANT_RUN_OPERATIONS, ASSISTANT_RUN_STATUSES, ASSISTANT_RUNTIME_PROVIDER, ASSISTANT_TRANSCRIPTION_PROVIDER, ASSISTANT_UNKNOWN_DELIVERY_STATE, estimateAssistantTokenCostUsd, type AssistantProviderDeliveryState, type AssistantStopReason } from './assistant-runtime.constants';
import { CHANNEL_PROVIDER, CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE, CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES } from '../channels/channels.constants';
import { isAssistantAllowedAt, isWithinBusinessHours, localDateAt, shiftLocalDate } from '../channels/channel-assistant-schedule';
import { channelAssistantScheduleModeSchema, channelOperationModeSchema, channelProviderSchema } from '../channels/channels.dto';
import { applyPendingEvolutionMessageStatuses } from '../webhooks/pending-message-statuses';

type AgentSendChannel = { channelId: string; provider: AssistantInboundEventDto['provider']; providerChannelId: string; recipientPhone: string; credentials: { ciphertext: string; iv: string; authTag: string } };

@Injectable()
export class AssistantRuntimeRepository {
  async startAssistantRun(input: { organizationId: string; conversationId: string; inboundMessageId: string; queueEventId: string; attempt: number; modelKey: string; promptHash?: string; operation?: typeof ASSISTANT_RUN_OPERATIONS[keyof typeof ASSISTANT_RUN_OPERATIONS] }): Promise<string> {
    const operation = input.operation ?? ASSISTANT_RUN_OPERATIONS.replyGeneration;
    const provider = operation === ASSISTANT_RUN_OPERATIONS.audioTranscription ? ASSISTANT_TRANSCRIPTION_PROVIDER : ASSISTANT_RUNTIME_PROVIDER;
    const [created] = await database.insert(assistantRuns).values({ ...input, provider, operation, pricingVersion: ASSISTANT_PRICING_VERSION, status: ASSISTANT_RUN_STATUSES.started, deliveryOutcome: ASSISTANT_DELIVERY_OUTCOMES.pending })
      .onConflictDoNothing({ target: [assistantRuns.organizationId, assistantRuns.queueEventId, assistantRuns.attempt, assistantRuns.operation] }).returning({ id: assistantRuns.id });
    if (created) return created.id;
    const [existing] = await database.select({ id: assistantRuns.id }).from(assistantRuns)
      .where(and(eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.queueEventId, input.queueEventId), eq(assistantRuns.attempt, input.attempt), eq(assistantRuns.operation, operation))).limit(1);
    if (!existing) throw new Error('Assistant run could not be created or recovered.');
    return existing.id;
  }

  async completeAssistantRun(input: { organizationId: string; runId: string; intent: AssistantAgentResponseDto['intent']; usageInputTokens: number | null; usageOutputTokens: number | null; latencyMs: number; stopReason: AssistantStopReason }): Promise<void> {
    const estimatedCostUsd = input.usageInputTokens === null || input.usageOutputTokens === null ? null : estimateAssistantTokenCostUsd((await database.select({ modelKey: assistantRuns.modelKey }).from(assistantRuns).where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId))).limit(1))[0]?.modelKey ?? '', input.usageInputTokens, input.usageOutputTokens);
    await database.update(assistantRuns).set({ status: ASSISTANT_RUN_STATUSES.completed, intent: input.intent, usageInputTokens: input.usageInputTokens, usageOutputTokens: input.usageOutputTokens, latencyMs: input.latencyMs, stopReason: input.stopReason, estimatedCostUsd, pricingVersion: ASSISTANT_PRICING_VERSION, completedAt: new Date() })
      .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.status, ASSISTANT_RUN_STATUSES.started)));
  }

  async completeAssistantTranscriptionRun(input: { organizationId: string; runId: string; durationSeconds: number | null; audioSizeBytes: number; latencyMs: number; estimatedCostUsd: string | null }): Promise<void> {
    await database.update(assistantRuns).set({ status: ASSISTANT_RUN_STATUSES.completed, deliveryOutcome: ASSISTANT_DELIVERY_OUTCOMES.skipped, audioDurationMs: input.durationSeconds === null ? null : Math.max(1, Math.round(input.durationSeconds * 1000)), audioSizeBytes: input.audioSizeBytes, latencyMs: input.latencyMs, estimatedCostUsd: input.estimatedCostUsd, pricingVersion: ASSISTANT_PRICING_VERSION, completedAt: new Date() })
      .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.operation, ASSISTANT_RUN_OPERATIONS.audioTranscription), eq(assistantRuns.status, ASSISTANT_RUN_STATUSES.started)));
  }

  async completeAssistantRunDelivery(input: { organizationId: string; runId: string; outboundMessageId: string | null; deliveryState: AssistantProviderDeliveryState | null; skipped: boolean }): Promise<void> {
    await database.update(assistantRuns).set({ outboundMessageId: input.outboundMessageId, deliveryState: input.deliveryState, deliveryOutcome: input.skipped ? ASSISTANT_DELIVERY_OUTCOMES.skipped : ASSISTANT_DELIVERY_OUTCOMES.messageCreated })
      .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.status, ASSISTANT_RUN_STATUSES.completed)));
  }

  async failAssistantRun(input: { organizationId: string; runId: string; errorCode: string; latencyMs: number | null; modelCompleted: boolean }): Promise<void> {
    if (input.modelCompleted) {
      const [run] = await database.select({ conversationId: assistantRuns.conversationId, inboundMessageId: assistantRuns.inboundMessageId }).from(assistantRuns)
        .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId))).limit(1);
      const [outbound] = run ? await database.select({ id: messages.id, deliveryState: messages.deliveryState }).from(messages)
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, run.conversationId), eq(messages.idempotencyKey, `${ASSISTANT_REPLY_IDEMPOTENCY_PREFIX}${run.inboundMessageId}`))).limit(1) : [];
      await database.update(assistantRuns).set({ deliveryOutcome: ASSISTANT_DELIVERY_OUTCOMES.error, errorCode: input.errorCode, outboundMessageId: outbound?.id ?? null, deliveryState: outbound?.deliveryState ?? null })
        .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.status, ASSISTANT_RUN_STATUSES.completed), eq(assistantRuns.deliveryOutcome, ASSISTANT_DELIVERY_OUTCOMES.pending)));
      return;
    }
    await database.update(assistantRuns).set({ status: ASSISTANT_RUN_STATUSES.failed, deliveryOutcome: ASSISTANT_DELIVERY_OUTCOMES.error, errorCode: input.errorCode, latencyMs: input.latencyMs, completedAt: new Date() })
      .where(and(eq(assistantRuns.id, input.runId), eq(assistantRuns.organizationId, input.organizationId), eq(assistantRuns.status, ASSISTANT_RUN_STATUSES.started)));
  }

  async claimNextEvent(): Promise<AssistantQueueEventDto | null> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.select({ id: outboxEvents.id, organizationId: outboxEvents.organizationId, payload: outboxEvents.payload, attempts: outboxEvents.attempts })
        .from(outboxEvents)
        .where(and(eq(outboxEvents.eventType, 'agent.inbound_message_received'), eq(outboxEvents.status, 'pending'), sql`${outboxEvents.availableAt} <= now()`))
        .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
        .for('update', { skipLocked: true })
        .limit(1);
      if (!event) return null;
      const [claimed] = await transaction.update(outboxEvents)
        .set({ availableAt: sql`now() + interval '90 seconds'`, attempts: sql`${outboxEvents.attempts} + 1` })
        .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, 'pending')))
        .returning({ id: outboxEvents.id, organizationId: outboxEvents.organizationId, payload: outboxEvents.payload, attempts: sql<number>`${outboxEvents.attempts}::int` });
      return claimed ?? null;
    });
  }

  async loadContext(queueEvent: AssistantQueueEventDto): Promise<AssistantRuntimeContextDto | null> {
    const payload = assistantInboundEventSchema.safeParse(queueEvent.payload);
    if (!payload.success || payload.data.organizationId !== queueEvent.organizationId) return null;
    const event = payload.data;
    const [context] = await database.select({
      conversationId: conversations.id, channelId: conversations.channelId, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId,
      provider: conversations.provider, businessLineId: messagingChannels.businessLineId, channelActive: messagingChannels.isActive, operationMode: messagingChannels.operationMode, inboundAssistantProfileId: messagingChannels.inboundAssistantProfileId, outboundAssistantProfileId: messagingChannels.outboundAssistantProfileId, assistantScheduleMode: messagingChannels.assistantScheduleMode, timeZone: messagingChannels.dailyLimitTimeZone, personPhone: people.phone,
    }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .innerJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, event.conversationId), eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, event.channelId))).limit(1);
    if (!context || context.provider !== event.provider || !context.channelActive) return null;
    const operationMode = channelOperationModeSchema.parse(context.operationMode);
    const selectedProfileId = operationMode === 'outbound' ? context.outboundAssistantProfileId : context.inboundAssistantProfileId;
    const [profileAgent] = selectedProfileId ? await database.select({ enabled: assistantProfiles.enabled, model: assistantProfiles.model, transcribeAudio: assistantProfiles.transcribeAudio, systemPrompt: assistantProfiles.systemPrompt, updatedByUserId: assistantProfiles.updatedByUserId }).from(assistantProfiles)
      .where(and(eq(assistantProfiles.id, selectedProfileId), eq(assistantProfiles.organizationId, event.organizationId), eq(assistantProfiles.businessLineId, context.businessLineId ?? ''))).limit(1) : [];
    const [lineAgent] = !selectedProfileId && operationMode !== 'outbound' && context.businessLineId ? await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedByUserId: agentSettings.updatedByUserId }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, event.organizationId), eq(agentSettings.businessLineId, context.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1) : [];
    const [globalAgent] = selectedProfileId || lineAgent || operationMode === 'outbound' ? [] : await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedByUserId: agentSettings.updatedByUserId }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, event.organizationId), isNull(agentSettings.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1);
    const agent = profileAgent ?? lineAgent ?? globalAgent;
    const businessHours = await database.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
      .where(and(eq(channelBusinessHours.organizationId, event.organizationId), eq(channelBusinessHours.channelId, event.channelId)));
    const assistantScheduleMode = channelAssistantScheduleModeSchema.parse(context.assistantScheduleMode);
    const eventAt = new Date(event.occurredAt);
    const eventLocalDate = localDateAt(context.timeZone, eventAt);
    const scheduleExceptions = eventLocalDate ? await database.select({ localDate: channelAssistantScheduleExceptions.localDate, assistantEnabled: channelAssistantScheduleExceptions.assistantEnabled, startTime: channelAssistantScheduleExceptions.startTime, endTime: channelAssistantScheduleExceptions.endTime, endDayOffset: channelAssistantScheduleExceptions.endDayOffset }).from(channelAssistantScheduleExceptions)
      .where(and(eq(channelAssistantScheduleExceptions.organizationId, event.organizationId), eq(channelAssistantScheduleExceptions.channelId, event.channelId), gte(channelAssistantScheduleExceptions.localDate, shiftLocalDate(eventLocalDate, -6)), lte(channelAssistantScheduleExceptions.localDate, eventLocalDate))) : [];
    if (!isAssistantAllowedAt({ mode: assistantScheduleMode, timeZone: context.timeZone, businessHours, scheduleExceptions, at: eventAt })) return null;

    const [latestInbound] = await database.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.organizationId, event.organizationId), eq(messages.conversationId, event.conversationId), eq(messages.direction, 'inbound')))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(1);
    if (!latestInbound || latestInbound.id !== event.messageId) return null;

    const history = await database.select({ direction: messages.direction, bodyText: messages.bodyText, transcriptText: messages.transcriptText }).from(messages)
      .where(and(eq(messages.organizationId, event.organizationId), eq(messages.conversationId, event.conversationId), sql`${messages.direction} in ('inbound', 'outbound')`))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(30);
    const historyMessages = history.reverse().flatMap((message) => {
      const content = [message.bodyText, message.transcriptText].filter(Boolean).join('\n');
      return content ? [{ role: message.direction === 'inbound' ? 'user' as const : 'assistant' as const, content }] : [];
    });
    const firstUserMessage = historyMessages.findIndex((message) => message.role === 'user');
    const recentMessages = historyMessages.slice(Math.max(firstUserMessage, 0)).reduce<typeof historyMessages>((combined, message) => {
      const previous = combined.at(-1);
      if (previous?.role === message.role) previous.content = `${previous.content}\n${message.content}`;
      else combined.push({ ...message });
      return combined;
    }, []);
    const [audioAttachment] = event.messageType.toLowerCase() === 'audio' ? await database.select({ id: messageAttachments.id, status: messageAttachments.status, storageKey: messageAttachments.storageKey, mimeType: messageAttachments.mimeType, fileName: messageAttachments.fileName, sizeBytes: messageAttachments.sizeBytes }).from(messageAttachments)
      .where(and(eq(messageAttachments.organizationId, event.organizationId), eq(messageAttachments.messageId, event.messageId), eq(messageAttachments.mediaType, 'audio'))).limit(1) : [];
    const audioTranscript = event.messageType.toLowerCase() === 'audio' ? (await database.select({ transcriptText: messages.transcriptText }).from(messages)
      .where(and(eq(messages.organizationId, event.organizationId), eq(messages.id, event.messageId))).limit(1))[0]?.transcriptText ?? null : null;
    return {
      event, enabled: agent?.enabled ?? false, model: agent?.model ?? 'claude-haiku-5-5', transcribeAudio: agent?.transcribeAudio ?? false, systemPrompt: agent?.systemPrompt ?? '', operationMode, assistantScheduleMode, businessHours, hasScheduleException: scheduleExceptions.some((exception) => exception.localDate === eventLocalDate), timeZone: context.timeZone, automationMode: context.automationMode, ownerUserId: context.ownerUserId,
      recipientPhone: (context.personPhone ?? '').replace(/\D/g, ''), messages: recentMessages,
      audioAttachment: audioAttachment ?? null,
      audioTranscript,
    };
  }

  async saveTranscript(organizationId: string, messageId: string, transcriptText: string): Promise<void> {
    await database.update(messages).set({ transcriptText }).where(and(eq(messages.organizationId, organizationId), eq(messages.id, messageId), eq(messages.direction, 'inbound')));
  }

  async deferEvent(queueEvent: AssistantQueueEventDto): Promise<void> {
    await database.update(outboxEvents).set({ availableAt: sql`now() + interval '10 seconds'`, attempts: sql`greatest(${outboxEvents.attempts} - 1, 0)`, lastErrorCode: null })
      .where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, queueEvent.organizationId), eq(outboxEvents.status, 'pending')));
  }

  async sendIfStillAutomated(input: { queueEventId: string; context: AssistantRuntimeContextDto; result: AssistantAgentResponseDto; send: (channel: AgentSendChannel) => Promise<ProviderSendResult> }): Promise<{ skipped: true } | { skipped: false; outboundMessageId: string; deliveryState: AssistantProviderDeliveryState }> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, organizationId: conversations.organizationId, channelId: conversations.channelId, accountId: conversations.accountId, personId: conversations.personId, opportunityId: conversations.opportunityId, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, input.context.event.conversationId), eq(conversations.organizationId, input.context.event.organizationId))).for('update').limit(1);
      if (!conversation || !conversation.personId || conversation.automationMode !== 'assistant' || conversation.ownerUserId || conversation.channelId !== input.context.event.channelId) return { skipped: true };

      const [latestInbound] = await transaction.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.organizationId, conversation.organizationId), eq(messages.conversationId, conversation.id), eq(messages.direction, 'inbound')))
        .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(1);
      if (latestInbound?.id !== input.context.event.messageId) return { skipped: true };

      const [channel] = await transaction.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, lineStatus: businessLines.status, operationMode: messagingChannels.operationMode, inboundAssistantProfileId: messagingChannels.inboundAssistantProfileId, outboundAssistantProfileId: messagingChannels.outboundAssistantProfileId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, assistantScheduleMode: messagingChannels.assistantScheduleMode, connectionStatus: messagingChannels.connectionStatus, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId))).where(and(eq(messagingChannels.id, conversation.channelId), eq(messagingChannels.organizationId, conversation.organizationId))).for('update').limit(1);
      if (!channel?.isActive || (channel.businessLineId && channel.lineStatus !== 'active') || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag || channel.provider !== input.context.event.provider) return { skipped: true };
      const outboundMode = channelOperationModeSchema.parse(channel.operationMode) === 'outbound';
      const selectedProfileId = outboundMode ? channel.outboundAssistantProfileId : channel.inboundAssistantProfileId;
      const [profileAgent] = selectedProfileId ? await transaction.select({ enabled: assistantProfiles.enabled, model: assistantProfiles.model, transcribeAudio: assistantProfiles.transcribeAudio, systemPrompt: assistantProfiles.systemPrompt, updatedByUserId: assistantProfiles.updatedByUserId }).from(assistantProfiles)
        .where(and(eq(assistantProfiles.id, selectedProfileId), eq(assistantProfiles.organizationId, conversation.organizationId), eq(assistantProfiles.businessLineId, channel.businessLineId ?? ''))).limit(1) : [];
      const [lineAgent] = !selectedProfileId && !outboundMode && channel.businessLineId ? await transaction.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedByUserId: agentSettings.updatedByUserId }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, conversation.organizationId), eq(agentSettings.businessLineId, channel.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1) : [];
      const [globalAgent] = selectedProfileId || lineAgent || outboundMode ? [] : await transaction.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedByUserId: agentSettings.updatedByUserId }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, conversation.organizationId), isNull(agentSettings.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1);
      const agent = profileAgent ?? lineAgent ?? globalAgent;
      if (!agent?.enabled || agent.model !== input.context.model || agent.systemPrompt !== input.context.systemPrompt) return { skipped: true };
      const [person] = await transaction.select({ phone: people.phone }).from(people).where(and(eq(people.id, conversation.personId), eq(people.organizationId, conversation.organizationId))).limit(1);
      const recipientPhone = (person?.phone ?? '').replace(/\D/g, '');
      if (recipientPhone.length < 8 || recipientPhone.length > 15 || recipientPhone[0] === '0') return { skipped: true };
      if (channel.provider === CHANNEL_PROVIDER.evolution && CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES.some((status) => status === channel.connectionStatus)) return { skipped: true };
      const [quota] = await transaction.select({ used: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, conversation.organizationId), eq(conversations.channelId, channel.id), eq(messages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${messages.occurredAt} at time zone ${channel.dailyLimitTimeZone})::date = (now() at time zone ${channel.dailyLimitTimeZone})::date`));
      if ((quota?.used ?? 0) >= channel.dailyMessageLimit) return { skipped: true };
      const businessHours = await transaction.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
        .where(and(eq(channelBusinessHours.organizationId, conversation.organizationId), eq(channelBusinessHours.channelId, channel.id)));
      const sendAt = new Date();
      const sendLocalDate = localDateAt(channel.dailyLimitTimeZone, sendAt);
      const scheduleExceptions = sendLocalDate ? await transaction.select({ localDate: channelAssistantScheduleExceptions.localDate, assistantEnabled: channelAssistantScheduleExceptions.assistantEnabled, startTime: channelAssistantScheduleExceptions.startTime, endTime: channelAssistantScheduleExceptions.endTime, endDayOffset: channelAssistantScheduleExceptions.endDayOffset }).from(channelAssistantScheduleExceptions)
        .where(and(eq(channelAssistantScheduleExceptions.organizationId, conversation.organizationId), eq(channelAssistantScheduleExceptions.channelId, channel.id), gte(channelAssistantScheduleExceptions.localDate, shiftLocalDate(sendLocalDate, -6)), lte(channelAssistantScheduleExceptions.localDate, sendLocalDate))) : [];
      if (channel.operationMode === 'outbound' || !isAssistantAllowedAt({ mode: channelAssistantScheduleModeSchema.parse(channel.assistantScheduleMode), timeZone: channel.dailyLimitTimeZone, businessHours, scheduleExceptions, at: sendAt })) return { skipped: true };

      const delivery = await input.send({ channelId: channel.id, provider: channelProviderSchema.parse(channel.provider), providerChannelId: channel.providerChannelId, recipientPhone, credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag } });
      const occurredAt = new Date();
      const idempotencyKey = `${ASSISTANT_REPLY_IDEMPOTENCY_PREFIX}${input.context.event.messageId}`;
      const [message] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'outbound', actorType: 'assistant', bodyText: input.result.replyText, deliveryState: delivery.deliveryState, externalMessageId: delivery.externalMessageId, idempotencyKey, occurredAt })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id, deliveryState: messages.deliveryState });
      if (message && delivery.externalMessageId) {
        const finalDeliveryState = await applyPendingEvolutionMessageStatuses(transaction, {
          organizationId: conversation.organizationId, channelId: conversation.channelId, messageId: message.id,
          externalMessageId: delivery.externalMessageId, currentState: message.deliveryState,
        });
        if (finalDeliveryState !== message.deliveryState) await transaction.update(messages).set({ deliveryState: finalDeliveryState })
          .where(and(eq(messages.id, message.id), eq(messages.organizationId, conversation.organizationId)));
      }
      const outboundMessage = message ?? (await transaction.select({ id: messages.id, deliveryState: messages.deliveryState }).from(messages)
        .where(and(eq(messages.organizationId, conversation.organizationId), eq(messages.conversationId, conversation.id), eq(messages.idempotencyKey, idempotencyKey))).limit(1))[0];
      if (!outboundMessage) throw new Error('Assistant outbound message could not be recovered.');
      if (message) {
        await transaction.update(conversations).set({ lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${occurredAt}), ${occurredAt})`, updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
        const action = delivery.deliveryState === 'failed' ? 'conversation.assistant_reply_failed' : delivery.deliveryState === 'unknown' ? 'conversation.assistant_reply_delivery_unknown' : 'conversation.assistant_reply_sent';
        await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action, entityType: 'conversation', entityId: conversation.id, afterState: { messageId: message.id, sourceMessageId: input.context.event.messageId, deliveryState: delivery.deliveryState } });
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
      }
      await transaction.update(conversations).set({
        assistantQualificationIntent: input.result.intent,
        assistantQualificationSummary: input.result.summary,
        assistantConfirmedFacts: input.result.confirmedFacts,
        assistantUnknowns: input.result.unknowns,
        assistantNextStep: input.result.nextStep,
        assistantQualificationUpdatedAt: occurredAt,
      }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'conversation.assistant_qualification_updated', entityType: 'conversation', entityId: conversation.id, afterState: { intent: input.result.intent, confirmedFactCount: input.result.confirmedFacts.length, unknownCount: input.result.unknowns.length } });

      if (conversation.opportunityId) {
        const [linkedOpportunity] = await transaction.select({ id: opportunities.id }).from(opportunities)
          .where(and(eq(opportunities.id, conversation.opportunityId), eq(opportunities.organizationId, conversation.organizationId))).for('update').limit(1);
        if (linkedOpportunity) {
          await transaction.insert(opportunityConversationContexts).values({ organizationId: conversation.organizationId, opportunityId: linkedOpportunity.id, conversationId: conversation.id, summary: input.result.summary, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, capturedAt: occurredAt })
            .onConflictDoUpdate({ target: [opportunityConversationContexts.organizationId, opportunityConversationContexts.conversationId], set: { opportunityId: linkedOpportunity.id, summary: input.result.summary, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, capturedAt: occurredAt } });
        }
      }

      const requestsCloser = ['meeting_request', 'proposal_request'].includes(input.result.intent);
      const requestsHuman = input.result.intent === 'explicit_human_request';
      let humanHandoffCreated = false;
      if ((requestsCloser || requestsHuman) && agent.updatedByUserId && conversation.personId) {
        const [lead] = await transaction.select({ id: leads.id, status: leads.status, accountId: leads.accountId, personId: leads.personId, accountName: accounts.name, personName: people.name })
          .from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
          .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId)))
          .innerJoin(people, and(eq(people.id, conversation.personId), eq(people.organizationId, leads.organizationId)))
          .where(and(eq(leads.organizationId, conversation.organizationId), or(eq(leads.personId, conversation.personId), eq(leadContacts.personId, conversation.personId)), conversation.accountId ? eq(leads.accountId, conversation.accountId) : sql`true`))
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
              const initialStage = requestsHuman ? 'closer_contact_pending' : 'qualification';
              const [createdOpportunity] = await transaction.insert(opportunities).values({ organizationId: conversation.organizationId, leadId: lead.id, accountId: lead.accountId, primaryPersonId: conversation.personId, name: `${lead.accountName} — ${input.result.summary.slice(0, 100)}`, stage: initialStage, nextAction: input.result.nextStep, nextActionAt: dueAt, createdByUserId: agent.updatedByUserId }).returning({ id: opportunities.id });
              opportunityId = createdOpportunity.id;
              await transaction.insert(opportunityStageHistory).values({ organizationId: conversation.organizationId, opportunityId, fromStage: null, fromPipelineStageKey: null, toStage: initialStage, toPipelineStageKey: null, actorUserId: agent.updatedByUserId, reason: requestsHuman ? 'Opportunity created from a lead request for human assistance.' : 'Opportunity created from Assistant qualified handoff.' });
              await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'opportunity.created', entityType: 'opportunity', entityId: opportunityId, afterState: { stage: initialStage, source: requestsHuman ? 'assistant_human_request' : 'assistant_handoff' } });
            }

            const dueAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);
            await transaction.insert(opportunityConversationContexts).values({ organizationId: conversation.organizationId, opportunityId, conversationId: conversation.id, summary: input.result.summary, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, capturedAt: occurredAt })
              .onConflictDoUpdate({ target: [opportunityConversationContexts.organizationId, opportunityConversationContexts.conversationId], set: { opportunityId, summary: input.result.summary, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, capturedAt: occurredAt } });
            await transaction.update(opportunities).set({ nextAction: input.result.nextStep, nextActionAt: dueAt, updatedAt: occurredAt }).where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, conversation.organizationId)));
            const requestDescription = requestsHuman ? 'Lead asked to speak with a person.' : `Lead requested a ${input.result.intent === 'meeting_request' ? 'meeting or demonstration' : 'proposal'}.`;
            const [handoff] = await transaction.insert(handoffs).values({ organizationId: conversation.organizationId, opportunityId, reason: input.result.summary, evidence: `${requestDescription} Latest message: ${input.context.messages.at(-1)?.content.slice(0, 1500) ?? ''}`, confirmedFacts: input.result.confirmedFacts, unknowns: input.result.unknowns, nextStep: input.result.nextStep, nextStepAt: dueAt, requestedByUserId: agent.updatedByUserId, requestedByAgent: true }).returning({ id: handoffs.id });
            humanHandoffCreated = requestsHuman;
            await transaction.insert(handoffHistory).values({ organizationId: conversation.organizationId, handoffId: handoff.id, event: 'requested', actorUserId: agent.updatedByUserId, note: requestsHuman ? 'Prepared by Assistant after an explicit request for a person; qualification may be incomplete.' : 'Prepared by Assistant from the qualified conversation.' });
            await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'handoff.requested', entityType: 'handoff', entityId: handoff.id, afterState: { status: 'requested', opportunityId, source: requestsHuman ? 'assistant_human_request' : 'assistant' } });
            if (lead.status !== 'converted_to_sdr') {
              if (lead.status !== 'responded') {
                await transaction.update(leads).set({ status: 'responded', updatedAt: occurredAt }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, conversation.organizationId)));
                await transaction.insert(leadStatusHistory).values({ organizationId: conversation.organizationId, leadId: lead.id, fromStatus: lead.status, toStatus: 'responded', changedByUserId: agent.updatedByUserId });
              }
              await transaction.update(leads).set({ status: 'converted_to_sdr', updatedAt: occurredAt }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, conversation.organizationId)));
              await transaction.insert(leadStatusHistory).values({ organizationId: conversation.organizationId, leadId: lead.id, fromStatus: 'responded', toStatus: 'converted_to_sdr', changedByUserId: agent.updatedByUserId });
              await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'lead.status_changed', entityType: 'lead', entityId: lead.id, afterState: { status: 'converted_to_sdr', source: 'assistant_handoff' } });
            }
            await transaction.update(conversations).set({ opportunityId, automationMode: 'human', updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
            const activeCloserLoad = transaction.select({ userId: closerEvents.assignedToUserId, workload: count() }).from(closerEvents)
              .where(and(eq(closerEvents.organizationId, conversation.organizationId), inArray(closerEvents.status, ['new', 'acknowledged', 'snoozed'])))
              .groupBy(closerEvents.assignedToUserId).as('active_closer_load');
            const closerConditions = [eq(authMember.organizationId, conversation.organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') @> ARRAY[${ORGANIZATION_CLOSER_ROLES[0]}]::text[]`];
            if (opportunityOwnerUserId) closerConditions.push(eq(authMember.userId, opportunityOwnerUserId));
            const [closer] = await transaction.select({ userId: authMember.userId }).from(authMember).leftJoin(activeCloserLoad, eq(activeCloserLoad.userId, authMember.userId))
              .where(and(...closerConditions))
              .orderBy(asc(sql`coalesce(${activeCloserLoad.workload}, 0)`), asc(authMember.createdAt), asc(authMember.userId)).limit(1);
            if (closer) {
              const eventType = requestsHuman ? 'human_requested' : 'qualified_handoff';
              const [slaPolicy] = await transaction.select({ targetMinutes: closerEventSlaPolicies.targetMinutes, escalateToManagers: closerEventSlaPolicies.escalateToManagers }).from(closerEventSlaPolicies)
                .where(and(eq(closerEventSlaPolicies.organizationId, conversation.organizationId), eq(closerEventSlaPolicies.eventType, eventType))).limit(1);
              const dueAt = slaPolicy ? new Date(occurredAt.getTime() + slaPolicy.targetMinutes * 60_000) : null;
              await transaction.insert(closerEvents).values({ organizationId: conversation.organizationId, eventType, priority: requestsHuman ? 'urgent' : 'high', idempotencyKey: `assistant-${requestsHuman ? 'human-request' : 'qualified-handoff'}:${input.context.event.messageId}`, conversationId: conversation.id, opportunityId, sourceMessageId: input.context.event.messageId, assignedToUserId: closer.userId, summary: input.result.summary.slice(0, 1000), evidence: input.context.messages.at(-1)?.content.slice(0, 1500) ?? null, occurredAt, dueAt, slaEscalateToManagers: slaPolicy?.escalateToManagers ?? false })
                .onConflictDoNothing({ target: [closerEvents.organizationId, closerEvents.idempotencyKey] });
            }
            const noticeText = requestsHuman ? 'The lead asked to speak with a person. Assistant paused automation and prepared the conversation for a closer. Review the open qualification questions before replying.' : 'Assistant prepared a qualified handoff for the closer. Review the handoff summary and take ownership of this conversation.';
            const [notice] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, conversationId: conversation.id, direction: 'internal', actorType: 'system', bodyText: noticeText, deliveryState: 'unknown', idempotencyKey: `assistant-handoff:${input.context.event.messageId}`, occurredAt })
              .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
            if (notice) await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
          }
        }
      }
      if (requestsHuman && !humanHandoffCreated) {
        await transaction.update(conversations).set({ automationMode: 'human', updatedAt: occurredAt }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, conversation.organizationId)));
        const [notice] = await transaction.insert(messages).values({ organizationId: conversation.organizationId, direction: 'internal', actorType: 'system', bodyText: 'The lead asked to speak with a person. Assistant paused automated replies so the team can take over.', deliveryState: 'unknown', idempotencyKey: `assistant-human-request:${input.context.event.messageId}`, conversationId: conversation.id, occurredAt })
          .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
        if (notice) await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: conversation.organizationId, conversationId: conversation.id, occurredAt: occurredAt.toISOString() })})`);
      }
      const needsAfterHoursAttention = requestsHuman || requestsCloser;
      const wasOutsideServiceHours = input.context.operationMode !== 'outbound' && !isWithinBusinessHours({ timeZone: input.context.timeZone, businessHours: input.context.businessHours, at: new Date(input.context.event.occurredAt) });
      if (needsAfterHoursAttention && (input.context.operationMode === 'outbound' || wasOutsideServiceHours)) {
        const members = await transaction.select({ userId: authMember.userId, role: authMember.role, businessLineId: businessLineMembers.businessLineId, status: businessLines.status }).from(authMember)
          .leftJoin(businessLineMembers, and(eq(businessLineMembers.memberId, authMember.id), eq(businessLineMembers.organizationId, authMember.organizationId), channel.businessLineId ? eq(businessLineMembers.businessLineId, channel.businessLineId) : sql`false`))
          .leftJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId), eq(businessLines.status, 'active')))
          .where(eq(authMember.organizationId, conversation.organizationId));
        const recipients = members.filter(({ role, businessLineId, status }) => hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES)
          || (Boolean(channel.businessLineId) && businessLineId === channel.businessLineId && status === 'active'
            && hasOrganizationRole(role, ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES)));
        const idempotencyKey = `inbox-new-message:${input.context.event.messageId}`;
        if (recipients.length) await transaction.insert(userNotifications).values(recipients.map(({ userId }) => ({ organizationId: conversation.organizationId, recipientUserId: userId, conversationId: conversation.id, notificationType: 'inbox_new_message', idempotencyKey })))
          .onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
        await transaction.insert(auditEvents).values({ organizationId: conversation.organizationId, actorType: 'system', action: 'conversation.after_hours_attention_requested', entityType: 'conversation', entityId: conversation.id, afterState: { sourceMessageId: input.context.event.messageId, intent: input.result.intent, recipientCount: recipients.length } });
      }
      await transaction.update(outboxEvents).set({ status: 'published', publishedAt: occurredAt, lastErrorCode: null }).where(and(eq(outboxEvents.id, input.queueEventId), eq(outboxEvents.organizationId, conversation.organizationId), eq(outboxEvents.status, 'pending')));
      const deliveryState = ASSISTANT_PROVIDER_DELIVERY_STATES.find((state) => state === outboundMessage.deliveryState) ?? ASSISTANT_UNKNOWN_DELIVERY_STATE;
      return { skipped: false, outboundMessageId: outboundMessage.id, deliveryState };
    });
  }

  async completeEvent(queueEvent: AssistantQueueEventDto): Promise<void> {
    await database.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), lastErrorCode: null })
      .where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, queueEvent.organizationId), eq(outboxEvents.status, 'pending')));
  }

  async escalateUnsupportedMessage(queueEvent: AssistantQueueEventDto, event: AssistantInboundEventDto): Promise<void> {
    if (event.organizationId !== queueEvent.organizationId) return;
    await database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, automationMode: conversations.automationMode, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, event.conversationId), eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, event.channelId))).for('update').limit(1);
      if (!conversation || conversation.automationMode !== 'assistant' || conversation.ownerUserId) {
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

      const [notice] = await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: event.conversationId, direction: 'internal', actorType: 'system', bodyText: 'Assistant could not interpret this message type. Automation was paused so a teammate can review and reply.', deliveryState: 'unknown', idempotencyKey: `assistant-unsupported:${event.messageId}`, occurredAt: new Date() })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      await transaction.update(conversations).set({ automationMode: 'human', updatedAt: new Date() }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, event.organizationId)));
      if (notice) {
        await transaction.insert(auditEvents).values({ organizationId: event.organizationId, actorType: 'system', action: 'conversation.assistant_unsupported_message', entityType: 'conversation', entityId: event.conversationId, afterState: { messageId: notice.id, sourceMessageId: event.messageId, messageType: event.messageType, automationMode: 'human' } });
        await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: event.conversationId, occurredAt: new Date().toISOString() })})`);
      }
      await transaction.update(outboxEvents).set({ status: 'published', publishedAt: new Date(), lastErrorCode: null }).where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, 'pending')));
    });
  }

  async retryOrFail(queueEvent: AssistantQueueEventDto, errorCode: string, retryable: boolean): Promise<boolean> {
    const terminal = !retryable || queueEvent.attempts >= 5;
    const delaySeconds = Math.min(300, queueEvent.attempts * queueEvent.attempts * 10);
    const [updated] = await database.update(outboxEvents).set({ status: terminal ? 'failed' : 'pending', availableAt: sql`now() + (${terminal ? 0 : delaySeconds} * interval '1 second')`, lastErrorCode: errorCode })
      .where(and(eq(outboxEvents.id, queueEvent.id), eq(outboxEvents.organizationId, queueEvent.organizationId), eq(outboxEvents.status, 'pending')))
      .returning({ id: outboxEvents.id });
    if (terminal && updated) await this.recordFailureNotice(queueEvent, errorCode);
    return terminal && Boolean(updated);
  }

  private async recordFailureNotice(queueEvent: AssistantQueueEventDto, errorCode: string): Promise<void> {
    const payload = assistantInboundEventSchema.safeParse(queueEvent.payload);
    if (!payload.success || payload.data.organizationId !== queueEvent.organizationId) return;
    const event = payload.data;
    await database.transaction(async (transaction) => {
      const [notice] = await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: event.conversationId, direction: 'internal', actorType: 'system', bodyText: 'Assistant could not prepare an automatic reply. A teammate needs to review this conversation.', deliveryState: 'unknown', idempotencyKey: `assistant-failure:${queueEvent.id}`, occurredAt: new Date() })
        .onConflictDoNothing({ target: [messages.organizationId, messages.conversationId, messages.idempotencyKey] }).returning({ id: messages.id });
      if (!notice) return;
      await transaction.insert(auditEvents).values({ organizationId: event.organizationId, actorType: 'system', action: 'conversation.assistant_runtime_failed', entityType: 'conversation', entityId: event.conversationId, afterState: { messageId: notice.id, sourceMessageId: event.messageId, errorCode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: event.conversationId, occurredAt: new Date().toISOString() })})`);
    });
  }
}
