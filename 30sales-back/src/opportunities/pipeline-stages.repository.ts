import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, opportunities, pipelineStages, pipelines } from '../db/schema';
import { DEFAULT_PIPELINE_STAGES, type OpportunityStage } from './opportunities.constants';
import { PipelineStageRecordDto, PipelineStagesDto, PipelineStageRepositoryArchiveDto, PipelineStageRepositoryCreateDto, PipelineStageRepositoryReorderDto, PipelineStageRepositoryUpdateDto } from './opportunities.dto';
import { PipelinesRepository } from './pipelines.repository';

@Injectable()
export class PipelineStagesRepository {
  constructor(private readonly pipelinesRepository: PipelinesRepository) {}

  async list(organizationId: string, pipelineId: string | undefined, canManage: boolean): Promise<PipelineStagesDto | 'not_found'> {
    const defaultPipelineId = await this.pipelinesRepository.ensureDefault(organizationId);
    const resolvedPipelineId = pipelineId ?? defaultPipelineId;
    const [pipeline] = await database.select({ id: pipelines.id }).from(pipelines)
      .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, resolvedPipelineId), eq(pipelines.isActive, true))).limit(1);
    if (!pipeline) return 'not_found';
    const rows = await database.select({ key: pipelineStages.key, stage: pipelineStages.stage, name: pipelineStages.name, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive, position: pipelineStages.position })
      .from(pipelineStages).where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, resolvedPipelineId))).orderBy(asc(pipelineStages.position), asc(pipelineStages.key));
    return new PipelineStagesDto(resolvedPipelineId, rows.map((row) => {
      const stage = row.stage ?? (row.isSystem ? DEFAULT_PIPELINE_STAGES.find((item) => item.key === row.key)?.key : 'custom');
      if (!stage) throw new Error('Unknown pipeline stage');
      return new PipelineStageRecordDto(row.key, stage as OpportunityStage, row.name, row.isSystem, row.isActive, row.position);
    }), canManage);
  }

  async create(input: PipelineStageRepositoryCreateDto): Promise<PipelineStagesDto | 'invalid_position' | 'duplicate_name' | 'limit_reached' | 'not_found'> {
    await this.pipelinesRepository.ensureDefault(input.organizationId);
    const result = await database.transaction(async (transaction) => {
      const [pipeline] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId), eq(pipelines.isActive, true))).for('share').limit(1);
      if (!pipeline) return 'not_found';
      const rows = await transaction.select({ key: pipelineStages.key, stage: pipelineStages.stage, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive, position: pipelineStages.position })
        .from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.position), asc(pipelineStages.key)).for('update');
      const anchorIndex = rows.findIndex((row) => row.key === input.afterStageKey);
      const anchor = rows[anchorIndex];
      if (!anchor || (anchor.stage ?? (anchor.isSystem ? anchor.key : 'custom')) === 'lost') return 'invalid_position';
      const customCount = rows.filter((row) => !row.isSystem).length;
      if (customCount >= 30) return 'limit_reached';
      const [duplicate] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true), sql`lower(${pipelineStages.name}) = lower(${input.name})`)).limit(1);
      if (duplicate) return 'duplicate_name';
      const key = randomUUID();
      await transaction.insert(pipelineStages).values({ organizationId: input.organizationId, pipelineId: input.pipelineId, key, stage: 'custom', name: input.name, position: 0, isSystem: false, isActive: true, createdByUserId: input.actorUserId });
      const orderedKeys = rows.map((row) => row.key);
      const insertionIndex = (anchor.stage ?? (anchor.isSystem ? anchor.key : 'custom')) === 'won' ? anchorIndex : anchorIndex + 1;
      orderedKeys.splice(insertionIndex, 0, key);
      await this.persistOrder(transaction, input.organizationId, input.pipelineId, orderedKeys);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.created', entityType: 'pipeline_stage', entityId: key, correlationId: input.correlationId, afterState: { pipelineId: input.pipelineId, name: input.name, beforeStageKey: input.afterStageKey } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.pipelineId, true) : result;
  }

  async update(input: PipelineStageRepositoryUpdateDto): Promise<PipelineStagesDto | 'not_found' | 'system_stage' | 'duplicate_name'> {
    const result = await database.transaction(async (transaction) => {
      await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.key)).for('update');
      const [current] = await transaction.select({ name: pipelineStages.name, isSystem: pipelineStages.isSystem }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.key, input.key))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.isSystem) return 'system_stage';
      const [duplicate] = await transaction.select({ key: pipelineStages.key }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true), sql`lower(${pipelineStages.name}) = lower(${input.name})`, sql`${pipelineStages.key} <> ${input.key}`)).limit(1);
      if (duplicate) return 'duplicate_name';
      await transaction.update(pipelineStages).set({ name: input.name, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.key, input.key), eq(pipelineStages.isActive, true)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.renamed', entityType: 'pipeline_stage', entityId: input.key, correlationId: input.correlationId, beforeState: { pipelineId: input.pipelineId, name: current.name }, afterState: { pipelineId: input.pipelineId, name: input.name } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.pipelineId, true) : result;
  }

  async reorder(input: PipelineStageRepositoryReorderDto): Promise<PipelineStagesDto | 'invalid_order' | 'not_found'> {
    const result = await database.transaction(async (transaction) => {
      const rows = await transaction.select({ key: pipelineStages.key, stage: pipelineStages.stage, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive })
        .from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true))).for('update');
      const expectedKeys = new Set(rows.map((row) => row.key));
      const requestedKeys = new Set(input.stageKeys);
      const stageFor = (key: string) => { const row = rows.find((item) => item.key === key); return row?.stage ?? (row?.isSystem ? row.key : 'custom'); };
      if (expectedKeys.size !== requestedKeys.size || [...expectedKeys].some((key) => !requestedKeys.has(key)) || input.stageKeys.at(-2) === undefined || stageFor(input.stageKeys.at(-2)!) !== 'won' || stageFor(input.stageKeys.at(-1)!) !== 'lost' || input.stageKeys.slice(0, -2).some((key) => stageFor(key) === 'won' || stageFor(key) === 'lost')) return 'invalid_order';
      await this.persistOrder(transaction, input.organizationId, input.pipelineId, input.stageKeys);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.reordered', entityType: 'pipeline_stage', entityId: input.pipelineId, correlationId: input.correlationId, afterState: { pipelineId: input.pipelineId, stageKeys: input.stageKeys } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.pipelineId, true) : result;
  }

  async archive(input: PipelineStageRepositoryArchiveDto): Promise<PipelineStagesDto | 'not_found' | 'system_stage' | 'stage_in_use'> {
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ name: pipelineStages.name, isSystem: pipelineStages.isSystem, isActive: pipelineStages.isActive }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.key, input.key))).for('update').limit(1);
      if (!current) return 'not_found';
      if (current.isSystem) return 'system_stage';
      if (!current.isActive) return 'saved' as const;
      const [used] = await transaction.select({ total: count() }).from(opportunities)
        .where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.pipelineId, input.pipelineId), eq(opportunities.stage, 'custom'), eq(opportunities.pipelineStageKey, input.key)));
      if (Number(used?.total ?? 0) > 0) return 'stage_in_use';
      await transaction.update(pipelineStages).set({ isActive: false, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.key, input.key)));
      const rows = await transaction.select({ key: pipelineStages.key }).from(pipelineStages).where(and(eq(pipelineStages.organizationId, input.organizationId), eq(pipelineStages.pipelineId, input.pipelineId), eq(pipelineStages.isActive, true))).orderBy(asc(pipelineStages.position), asc(pipelineStages.key));
      await this.persistOrder(transaction, input.organizationId, input.pipelineId, rows.map((row) => row.key));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline_stage.archived', entityType: 'pipeline_stage', entityId: input.key, correlationId: input.correlationId, beforeState: { pipelineId: input.pipelineId, name: current.name, isActive: true }, afterState: { pipelineId: input.pipelineId, name: current.name, isActive: false } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.pipelineId, true) : result;
  }

  private async persistOrder(transaction: Parameters<Parameters<typeof database.transaction>[0]>[0], organizationId: string, pipelineId: string, stageKeys: string[]): Promise<void> {
    for (const [index, key] of stageKeys.entries()) {
      await transaction.update(pipelineStages).set({ position: index * 100, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.key, key), eq(pipelineStages.isActive, true)));
    }
  }
}
