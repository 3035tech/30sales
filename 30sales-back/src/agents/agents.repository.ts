import { Injectable } from '@nestjs/common';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { agentSettings, assistantProfiles, auditEvents, businessLines, conversations, messages, messagingChannels } from '../db/schema';
import { AssistantProfileDto, assistantProfileDirectionSchema, AssistantProfileRepositoryDto, AssistantSettingsDto, AssistantSettingsRepositoryDto } from './agents.dto';
import { ASSISTANT_CONVERSATION_ASSIST_MODES, ASSISTANT_MANUAL_ACTION } from './agents.constants';
import { ASSISTANT_PRICING_VERSION, estimateAssistantTokenCostUsd } from './assistant-runtime.constants';

@Injectable()
export class AgentsRepository {
  async recordManualReplyDraft(input: { organizationId: string; conversationId: string; actorUserId: string; correlationId: string | null; model: string; usageInputTokens: number | null; usageOutputTokens: number | null }): Promise<void> {
    const estimatedCostUsd = input.usageInputTokens !== null && input.usageOutputTokens !== null ? estimateAssistantTokenCostUsd(input.model, input.usageInputTokens, input.usageOutputTokens) : null;
    await database.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: ASSISTANT_MANUAL_ACTION.replyDrafted, entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { model: input.model, usageInputTokens: input.usageInputTokens, usageOutputTokens: input.usageOutputTokens, estimatedCostUsd, pricingVersion: ASSISTANT_PRICING_VERSION } });
  }

  async recordConversationConsultation(input: { organizationId: string; conversationId: string; actorUserId: string; correlationId: string | null; mode: (typeof ASSISTANT_CONVERSATION_ASSIST_MODES)[number]; model: string; usageInputTokens: number | null; usageOutputTokens: number | null }): Promise<void> {
    const estimatedCostUsd = input.usageInputTokens !== null && input.usageOutputTokens !== null ? estimateAssistantTokenCostUsd(input.model, input.usageInputTokens, input.usageOutputTokens) : null;
    await database.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: ASSISTANT_MANUAL_ACTION.conversationConsulted, entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { mode: input.mode, model: input.model, usageInputTokens: input.usageInputTokens, usageOutputTokens: input.usageOutputTokens, estimatedCostUsd, pricingVersion: ASSISTANT_PRICING_VERSION } });
  }

  async loadManualReplyContext(organizationId: string, conversationId: string): Promise<{ ownerUserId: string | null; automationMode: string; status: string; model: string; systemPrompt: string; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }> } | null> {
    const [conversation] = await database.select({ ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode, status: conversations.status, businessLineId: messagingChannels.businessLineId, inboundProfileId: messagingChannels.inboundAssistantProfileId, outboundProfileId: messagingChannels.outboundAssistantProfileId, operationMode: messagingChannels.operationMode })
      .from(conversations).innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    if (!conversation) return null;
    const profileId = conversation.operationMode === 'outbound' ? conversation.outboundProfileId : conversation.inboundProfileId;
    const [profile] = profileId && conversation.businessLineId ? await database.select({ enabled: assistantProfiles.enabled, model: assistantProfiles.model, systemPrompt: assistantProfiles.systemPrompt }).from(assistantProfiles)
      .where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.organizationId, organizationId), eq(assistantProfiles.businessLineId, conversation.businessLineId))).limit(1) : [];
    const [lineSettings] = !profile && conversation.businessLineId ? await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.businessLineId, conversation.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1) : [];
    const [globalSettings] = !profile && !lineSettings ? await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, organizationId), isNull(agentSettings.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1) : [];
    const assistant = profile ?? lineSettings ?? globalSettings;
    if (!assistant?.enabled) return null;
    const history = await database.select({ id: messages.id, direction: messages.direction, bodyText: messages.bodyText, transcriptText: messages.transcriptText }).from(messages)
      .where(and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversationId), sql`${messages.direction} in ('inbound', 'outbound')`))
      .orderBy(sql`${messages.occurredAt} desc`, sql`${messages.id} desc`).limit(30);
    const thread = history.reverse().flatMap((message) => {
      const content = [message.bodyText, message.transcriptText].filter(Boolean).join('\n');
      return content ? [{ id: message.id, role: message.direction === 'inbound' ? 'user' as const : 'assistant' as const, content }] : [];
    });
    return { ownerUserId: conversation.ownerUserId, automationMode: conversation.automationMode, status: conversation.status, model: assistant.model, systemPrompt: assistant.systemPrompt, messages: thread };
  }

  async listAssistantProfiles(organizationId: string, businessLineId: string): Promise<AssistantProfileDto[] | null> {
    const [line] = await database.select({ id: businessLines.id }).from(businessLines)
      .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.id, businessLineId), eq(businessLines.status, 'active'))).limit(1);
    if (!line) return null;
    const rows = await database.select().from(assistantProfiles)
      .where(and(eq(assistantProfiles.organizationId, organizationId), eq(assistantProfiles.businessLineId, businessLineId)))
      .orderBy(assistantProfiles.direction, assistantProfiles.name, assistantProfiles.id);
    return rows.map((row) => new AssistantProfileDto(row.id, row.businessLineId, assistantProfileDirectionSchema.parse(row.direction), row.name, row.enabled, row.model, row.transcribeAudio, row.systemPrompt, row.updatedAt.toISOString()));
  }

  async saveAssistantProfile(input: AssistantProfileRepositoryDto): Promise<AssistantProfileDto | null | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [line] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.id, input.input.businessLineId), eq(businessLines.status, 'active'))).for('update').limit(1);
      if (!line) return null;
      const updatedAt = new Date();
      let row: typeof assistantProfiles.$inferSelect | undefined;
      if (input.profileId) {
        [row] = await transaction.update(assistantProfiles).set({ name: input.input.name, direction: input.input.direction, enabled: input.input.enabled, model: input.input.model, transcribeAudio: input.input.transcribeAudio, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt })
          .where(and(eq(assistantProfiles.id, input.profileId), eq(assistantProfiles.organizationId, input.organizationId), eq(assistantProfiles.businessLineId, input.input.businessLineId))).returning();
        if (!row) return 'not_found';
      } else {
        [row] = await transaction.insert(assistantProfiles).values({ organizationId: input.organizationId, businessLineId: input.input.businessLineId, direction: input.input.direction, name: input.input.name, enabled: input.input.enabled, model: input.input.model, transcribeAudio: input.input.transcribeAudio, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt }).returning();
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: input.profileId ? 'assistant.profile_updated' : 'assistant.profile_created', entityType: 'assistant_profile', entityId: row.id, correlationId: input.correlationId, afterState: { businessLineId: row.businessLineId, direction: row.direction, name: row.name, enabled: row.enabled, model: row.model, transcribeAudio: row.transcribeAudio, systemPromptLength: row.systemPrompt.length } });
      return new AssistantProfileDto(row.id, row.businessLineId, assistantProfileDirectionSchema.parse(row.direction), row.name, row.enabled, row.model, row.transcribeAudio, row.systemPrompt, row.updatedAt.toISOString());
    });
  }

  async deleteAssistantProfile(organizationId: string, profileId: string, userId: string, correlationId: string | null): Promise<boolean | 'assigned'> {
    return database.transaction(async (transaction) => {
      const [profile] = await transaction.select().from(assistantProfiles)
        .where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.organizationId, organizationId))).for('update').limit(1);
      if (!profile) return false;
      const [assignment] = await transaction.select({ id: messagingChannels.id }).from(messagingChannels)
        .where(and(eq(messagingChannels.organizationId, organizationId), or(eq(messagingChannels.inboundAssistantProfileId, profileId), eq(messagingChannels.outboundAssistantProfileId, profileId)))).limit(1);
      if (assignment) return 'assigned';
      await transaction.delete(assistantProfiles).where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.organizationId, organizationId)));
      await transaction.insert(auditEvents).values({ organizationId, actorUserId: userId, actorType: 'user', action: 'assistant.profile_deleted', entityType: 'assistant_profile', entityId: profileId, correlationId, beforeState: { businessLineId: profile.businessLineId, direction: profile.direction, name: profile.name, enabled: profile.enabled, model: profile.model } });
      return true;
    });
  }

  async resetBusinessLineAssistantSettings(organizationId: string, businessLineId: string, userId: string, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [line] = await transaction.select({ id: businessLines.id }).from(businessLines).where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.id, businessLineId), eq(businessLines.status, 'active'))).for('update').limit(1);
      if (!line) return false;
      const [deleted] = await transaction.delete(agentSettings).where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.businessLineId, businessLineId), eq(agentSettings.agentKey, 'assistant'))).returning({ id: agentSettings.id });
      if (deleted) await transaction.insert(auditEvents).values({ organizationId, actorUserId: userId, actorType: 'user', action: 'agent.assistant_settings_reset', entityType: 'agent_settings', entityId: deleted.id, correlationId, beforeState: { businessLineId }, afterState: { inheritedFromOrganization: true } });
      return true;
    });
  }

  async getAssistantSettings(organizationId: string, businessLineId: string | null = null): Promise<AssistantSettingsDto | null> {
    const [line] = businessLineId ? await database.select({ id: businessLines.id, name: businessLines.name }).from(businessLines)
      .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.id, businessLineId), eq(businessLines.status, 'active'))).limit(1) : [];
    if (businessLineId && !line) return null;
    const [settings] = await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt, businessLineId: agentSettings.businessLineId })
      .from(agentSettings).where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.agentKey, 'assistant'), businessLineId ? eq(agentSettings.businessLineId, businessLineId) : isNull(agentSettings.businessLineId))).limit(1);
    if (!businessLineId) return new AssistantSettingsDto(settings?.enabled ?? false, settings?.model ?? 'claude-haiku-5-5', settings?.transcribeAudio ?? false, settings?.systemPrompt ?? '', settings?.updatedAt.toISOString() ?? null);
    const [globalSettings] = settings ? [] : await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.agentKey, 'assistant'), isNull(agentSettings.businessLineId))).limit(1);
    const effective = settings ?? globalSettings;
    return new AssistantSettingsDto(effective?.enabled ?? false, effective?.model ?? 'claude-haiku-5-5', effective?.transcribeAudio ?? false, effective?.systemPrompt ?? '', effective?.updatedAt.toISOString() ?? null, false, false, businessLineId, line?.name ?? null, !settings);
  }

  async saveAssistantSettings(input: AssistantSettingsRepositoryDto): Promise<AssistantSettingsDto | null> {
    const updatedAt = new Date();
    return database.transaction(async (transaction) => {
      if (input.businessLineId) {
        const [line] = await transaction.select({ id: businessLines.id }).from(businessLines).where(and(eq(businessLines.id, input.businessLineId), eq(businessLines.organizationId, input.organizationId), eq(businessLines.status, 'active'))).for('update').limit(1);
        if (!line) return null;
      }
      const values = { organizationId: input.organizationId, businessLineId: input.businessLineId, agentKey: 'assistant', enabled: input.input.enabled, model: input.input.model, transcribeAudio: input.input.transcribeAudio, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt };
      const insert = transaction.insert(agentSettings).values(values);
      const returned = { enabled: agentSettings.enabled, model: agentSettings.model, transcribeAudio: agentSettings.transcribeAudio, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt };
      const [saved] = input.businessLineId
        ? await insert.onConflictDoUpdate({ target: [agentSettings.organizationId, agentSettings.businessLineId, agentSettings.agentKey], targetWhere: sql`${agentSettings.businessLineId} is not null`, set: { enabled: input.input.enabled, model: input.input.model, transcribeAudio: input.input.transcribeAudio, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt } }).returning(returned)
        : await insert.onConflictDoUpdate({ target: [agentSettings.organizationId, agentSettings.agentKey], targetWhere: sql`${agentSettings.businessLineId} is null`, set: { enabled: input.input.enabled, model: input.input.model, transcribeAudio: input.input.transcribeAudio, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt } }).returning(returned);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'agent.assistant_settings_updated', entityType: 'agent_settings', entityId: null, correlationId: input.correlationId, afterState: { businessLineId: input.businessLineId, enabled: saved.enabled, model: saved.model, transcribeAudio: saved.transcribeAudio, systemPromptLength: saved.systemPrompt.length } });
      const line = input.businessLineId ? (await transaction.select({ name: businessLines.name }).from(businessLines).where(and(eq(businessLines.id, input.businessLineId), eq(businessLines.organizationId, input.organizationId))).limit(1))[0] : null;
      return new AssistantSettingsDto(saved.enabled, saved.model, saved.transcribeAudio, saved.systemPrompt, saved.updatedAt.toISOString(), false, false, input.businessLineId, line?.name ?? null, false);
    });
  }
}
