import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { database } from '../db';
import { agentSettings, auditEvents } from '../db/schema';
import { AssistantSettingsDto, AssistantSettingsRepositoryDto } from './agents.dto';

@Injectable()
export class AgentsRepository {
  async getAssistantSettings(organizationId: string): Promise<AssistantSettingsDto> {
    const [settings] = await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt })
      .from(agentSettings).where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.agentKey, 'assistant'))).limit(1);
    return new AssistantSettingsDto(settings?.enabled ?? false, settings?.model ?? 'claude-haiku-5-5', settings?.systemPrompt ?? '', settings?.updatedAt.toISOString() ?? null);
  }

  async saveAssistantSettings(input: AssistantSettingsRepositoryDto): Promise<AssistantSettingsDto> {
    const updatedAt = new Date();
    const [settings] = await database.transaction(async (transaction) => {
      const [saved] = await transaction.insert(agentSettings).values({ organizationId: input.organizationId, agentKey: 'assistant', enabled: input.input.enabled, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt })
        .onConflictDoUpdate({ target: [agentSettings.organizationId, agentSettings.agentKey], set: { enabled: input.input.enabled, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt } })
        .returning({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'agent.assistant_settings_updated', entityType: 'agent_settings', entityId: null, afterState: { enabled: saved.enabled, model: saved.model, systemPromptLength: saved.systemPrompt.length } });
      return [saved];
    });
    return new AssistantSettingsDto(settings.enabled, settings.model, settings.systemPrompt, settings.updatedAt.toISOString());
  }
}
