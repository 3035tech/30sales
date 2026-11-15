import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, opportunities, pipelineStages } from '../db/schema';
import { DEFAULT_PIPELINE_STAGES } from './opportunities.constants';
import { PipelineStageRecordDto, PipelineStagesDto, PipelineStageRepositoryArchiveDto, PipelineStageRepositoryCreateDto, PipelineStageRepositoryReorderDto, PipelineStageRepositoryUpdateDto } from './opportunities.dto';

@Injectable()
export class PipelineStagesRepository {
  async list(organizationId: string, canManage: boolean): Promise<PipelineStagesDto> {
    await this.ensureDefaults(organizationId);
    const rows = await database.select({ key: pipelineStages.key, name: pipelineStages.name, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive, position: pipelineStages.position })
      .from(pipelineStages).where(eq(pipelineStages.organizationId, organizationId)).orderBy(asc(pipelineStages.position), asc(pipelineStages.key));
    return new PipelineStagesDto(rows.map((row) => {
      const systemStage = row.isSystem ? DEFAULT_PIPELINE_STAGES.find((stage) => stage.key === row.key)?.key : null;
      if (row.isSystem && !systemStage) throw new Error('Unknown system pipeline stage');
      return new PipelineStageRecordDto(row.key, systemStage ?? 'custom', row.name, row.isSystem, row.isActive, row.position);
    }), canManage);
  }

  async create(input: PipelineStageRepositoryCreateDto): Promise<PipelineStagesDto | 'invalid_position' | 'duplicate_name' | 'limit_reached'> {
    await this.ensureDefaults(input.organizationId);
    const result = await database.transaction(async (transaction) => {
      const rows = await transaction.select({ key: pipelineStages.key, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive, position: pipelineStages.position })
        .from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.position), asc(pipelineStages.key)).for('update');
      const anchorIndex = rows.findIndex((row) => row.key === input.afterStageKey);
      const anchor = rows[anchorIndex];
      if (!anchor || anchor.key === 'won' || anchor.key === 'lost') return 'invalid_position';
      const customCount = rows.filter((row) => !row.isSystem).length;
      if (customCount >= 30) return 'limit_reached';
      const [duplicate] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true), sql`lower(${pipelineStages.name}) = lower(${input.name})`)).limit(1);
      if (duplicate) return 'duplicate_name';
      const key = randomUUID();
      await transaction.insert(pipelineStages).values({ organizationId: input.organizationId, key, name: input.name, position: 0, isSystem: false, isActive: true, createdByUserId: input.actorUserId });
      const orderedKeys = rows.map((row) => row.key);
      orderedKeys.splice(anchorIndex + 1, 0, key);
      await this.persistOrder(transaction, input.organizationId, orderedKeys);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.created', entityType: 'pipeline_stage', entityId: key, correlationId: input.correlationId, afterState: { name: input.name, afterStageKey: input.afterStageKey } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  async update(input: PipelineStageRepositoryUpdateDto): Promise<PipelineStagesDto | 'not_found' | 'system_stage' | 'duplicate_name'> {
    await this.ensureDefaults(input.organizationId);
    const result = await database.transaction(async (transaction) => {
      await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.key)).for('update');
      const [current] = await transaction.select({ name: pipelineStages.name, isSystem: pipelineStages.isSystem }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.key, input.key))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.isSystem) return 'system_stage';
      const [activeStage] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.key, input.key), eq(pipelineStages.isActive, true))).limit(1);
      if (!activeStage) return 'not_found';
      const [duplicate] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true), sql`lower(${pipelineStages.name}) = lower(${input.name})`, sql`${pipelineStages.key} <> ${input.key}`)).limit(1);
      if (duplicate) return 'duplicate_name';
      await transaction.update(pipelineStages).set({ name: input.name, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.key, input.key)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.renamed', entityType: 'pipeline_stage', entityId: input.key, correlationId: input.correlationId, beforeState: { name: current.name }, afterState: { name: input.name } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  async reorder(input: PipelineStageRepositoryReorderDto): Promise<PipelineStagesDto | 'invalid_order'> {
    await this.ensureDefaults(input.organizationId);
    const result = await database.transaction(async (transaction) => {
      const rows = await transaction.select({ key: pipelineStages.key, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive })
        .from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true))).for('update');
      const expectedKeys = new Set(rows.map((row) => row.key));
      const requestedKeys = new Set(input.stageKeys);
      const systemOrder = rows.filter((row) => row.isSystem).map((row) => row.key).sort((left, right) => DEFAULT_PIPELINE_STAGES.findIndex((stage) => stage.key === left) - DEFAULT_PIPELINE_STAGES.findIndex((stage) => stage.key === right));
      const requestedSystemOrder = input.stageKeys.filter((key) => rows.find((row) => row.key === key)?.isSystem);
      if (expectedKeys.size !== requestedKeys.size || [...expectedKeys].some((key) => !requestedKeys.has(key)) || systemOrder.some((key, index) => requestedSystemOrder[index] !== key) || input.stageKeys.at(-2) !== 'won' || input.stageKeys.at(-1) !== 'lost') return 'invalid_order';
      await this.persistOrder(transaction, input.organizationId, input.stageKeys);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.reordered', entityType: 'pipeline_stage', entityId: input.organizationId, correlationId: input.correlationId, afterState: { stageKeys: input.stageKeys } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  async archive(input: PipelineStageRepositoryArchiveDto): Promise<PipelineStagesDto | 'not_found' | 'system_stage' | 'stage_in_use'> {
    await this.ensureDefaults(input.organizationId);
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ name: pipelineStages.name, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.key, input.key))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.isSystem) return 'system_stage';
      if (!current.isActive) return 'saved' as const;
      const [used] = await transaction.select({ total: count() }).from(opportunities)
        .where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.stage, 'custom'), eq(opportunities.pipelineStageKey, input.key)));
      if (Number(used?.total ?? 0) > 0) return 'stage_in_use';
      await transaction.update(pipelineStages).set({ isActive: false, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.key, input.key)));
      const rows = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.position), asc(pipelineStages.key));
      await this.persistOrder(transaction, input.organizationId, rows.map((row) => row.key));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.archived', entityType: 'pipeline_stage', entityId: input.key, correlationId: input.correlationId, beforeState: { name: current.name, isActive: true }, afterState: { name: current.name, isActive: false } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  private async ensureDefaults(organizationId: string): Promise<void> {
    await database.insert(pipelineStages).values(DEFAULT_PIPELINE_STAGES.map((stage) => ({ organizationId, key: stage.key, name: null, position: stage.position, isSystem: true, isActive: true })))
      .onConflictDoNothing({ target: [pipelineStages.organizationId, pipelineStages.key] });
  }

  private async persistOrder(transaction: Parameters<Parameters<typeof database.transaction>[0]>[0], organizationId: string, stageKeys: string[]): Promise<void> {
    for (const [index, key] of stageKeys.entries()) {
      await transaction.update(pipelineStages).set({ position: index * 100, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.key, key), eq(pipelineStages.isActive, true)));
    }
  }
}
