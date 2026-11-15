import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { database } from '../db';
import { agentSettings, auditEvents } from '../db/schema';
import { SofiaSettingsDto, SofiaSettingsRepositoryDto } from './agents.dto';

@Injectable()
export class AgentsRepository {
  async getSofiaSettings(organizationId: string): Promise<SofiaSettingsDto> {
    const [settings] = await database.select({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt })
      .from(agentSettings).where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.agentKey, 'sofia'))).limit(1);
    return new SofiaSettingsDto(settings?.enabled ?? false, settings?.model ?? 'claude-haiku-5-5', settings?.systemPrompt ?? '', settings?.updatedAt.toISOString() ?? null);
  }

  async saveSofiaSettings(input: SofiaSettingsRepositoryDto): Promise<SofiaSettingsDto> {
    const updatedAt = new Date();
    const [settings] = await database.transaction(async (transaction) => {
      const [saved] = await transaction.insert(agentSettings).values({ organizationId: input.organizationId, agentKey: 'sofia', enabled: input.input.enabled, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt })
        .onConflictDoUpdate({ target: [agentSettings.organizationId, agentSettings.agentKey], set: { enabled: input.input.enabled, systemPrompt: input.input.systemPrompt, updatedByUserId: input.userId, updatedAt } })
        .returning({ enabled: agentSettings.enabled, model: agentSettings.model, systemPrompt: agentSettings.systemPrompt, updatedAt: agentSettings.updatedAt });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'agent.sofia_settings_updated', entityType: 'agent_settings', entityId: null, afterState: { enabled: saved.enabled, model: saved.model, systemPromptLength: saved.systemPrompt.length } });
      return [saved];
    });
    return new SofiaSettingsDto(settings.enabled, settings.model, settings.systemPrompt, settings.updatedAt.toISOString());
  }
}
