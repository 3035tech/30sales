import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { database } from '../db';
import { agentSettings, auditEvents, businessLines } from '../db/schema';
import { AssistantSettingsDto, AssistantSettingsRepositoryDto } from './agents.dto';

@Injectable()
export class AgentsRepository {
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
