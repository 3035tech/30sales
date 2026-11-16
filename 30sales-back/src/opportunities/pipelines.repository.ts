import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, opportunities, pipelineStages, pipelines } from '../db/schema';
import { PipelineRecordDto, PipelineRepositoryArchiveDto, PipelineRepositoryCreateDto, PipelineRepositoryUpdateDto, PipelinesDto } from './opportunities.dto';
import { DEFAULT_PIPELINE_STAGES } from './opportunities.constants';

@Injectable()
export class PipelinesRepository {
  async list(organizationId: string, canManage: boolean): Promise<PipelinesDto> {
    const defaultPipelineId = await this.ensureDefault(organizationId);
    const rows = await database.select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault, isActive: pipelines.isActive })
      .from(pipelines).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isActive, true))).orderBy(sql`${pipelines.isDefault} desc`, asc(pipelines.name));
    return new PipelinesDto(rows.map((row) => new PipelineRecordDto(row.id, row.name, row.isDefault, row.isActive)), defaultPipelineId, canManage);
  }

  async ensureDefault(organizationId: string): Promise<string> {
    let [defaultPipeline] = await database.select({ id: pipelines.id }).from(pipelines)
      .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isDefault, true), eq(pipelines.isActive, true))).limit(1);
    if (!defaultPipeline) {
      const id = randomUUID();
      await database.insert(pipelines).values({ id, organizationId, name: 'Pipeline principal', isDefault: true, isActive: true }).onConflictDoNothing();
      ;[defaultPipeline] = await database.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isDefault, true), eq(pipelines.isActive, true))).limit(1);
    }
    if (!defaultPipeline) throw new Error('Default sales pipeline could not be initialized');
    await database.transaction(async (transaction) => {
      await transaction.update(pipelineStages).set({ pipelineId: defaultPipeline.id, stage: sql`case when ${pipelineStages.isSystem} then ${pipelineStages.key}::opportunity_stage else 'custom'::opportunity_stage end` })
        .where(and(eq(pipelineStages.organizationId, organizationId), sql`${pipelineStages.pipelineId} is null`));
      await transaction.update(opportunities).set({ pipelineId: defaultPipeline.id })
        .where(and(eq(opportunities.organizationId, organizationId), sql`${opportunities.pipelineId} is null`));
      const [legacyStages] = await transaction.select({ total: count() }).from(pipelineStages)
        .where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, defaultPipeline.id)));
      const [existingOpportunities] = await transaction.select({ total: count() }).from(opportunities)
        .where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.pipelineId, defaultPipeline.id)));
      const seedStages = Number(legacyStages?.total ?? 0) > 0 || Number(existingOpportunities?.total ?? 0) > 0
        ? DEFAULT_PIPELINE_STAGES.map((stage) => ({ organizationId, pipelineId: defaultPipeline.id, key: stage.key, stage: stage.key, name: null, position: stage.position, isSystem: true, isActive: true }))
        : (['won', 'lost'] as const).map((stage, index) => ({ organizationId, pipelineId: defaultPipeline.id, key: `${stage}-${defaultPipeline.id}`, stage, name: null, position: (index + 1) * 100, isSystem: true, isActive: true }));
      await transaction.insert(pipelineStages).values(seedStages)
        .onConflictDoNothing({ target: [pipelineStages.organizationId, pipelineStages.key] });
    });
    return defaultPipeline.id;
  }

  async create(input: PipelineRepositoryCreateDto): Promise<PipelinesDto | 'duplicate_name' | 'limit_reached'> {
    const result = await database.transaction(async (transaction) => {
      const [duplicate] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.isActive, true), sql`lower(${pipelines.name}) = lower(${input.name})`)).limit(1);
      if (duplicate) return 'duplicate_name';
      const [total] = await transaction.select({ total: count() }).from(pipelines).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.isActive, true)));
      if (Number(total?.total ?? 0) >= 20) return 'limit_reached';
      const id = randomUUID();
      await transaction.insert(pipelines).values({ id, organizationId: input.organizationId, name: input.name, isDefault: false, createdByUserId: input.actorUserId });
      const now = new Date();
      await transaction.insert(pipelineStages).values((['won', 'lost'] as const).map((stage, index) => ({ organizationId: input.organizationId, pipelineId: id, key: `${stage}-${id}`, stage, name: null, position: (index + 1) * 100, isSystem: true, isActive: true, createdByUserId: input.actorUserId, createdAt: now, updatedAt: now })));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline.created', entityType: 'pipeline', entityId: id, correlationId: input.correlationId, afterState: { name: input.name } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  async update(input: PipelineRepositoryUpdateDto): Promise<PipelinesDto | 'not_found' | 'duplicate_name'> {
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ name: pipelines.name }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId), eq(pipelines.isActive, true))).for('update').limit(1);
      if (!current) return 'not_found';
      const [duplicate] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.isActive, true), sql`lower(${pipelines.name}) = lower(${input.name})`, sql`${pipelines.id} <> ${input.pipelineId}`)).limit(1);
      if (duplicate) return 'duplicate_name';
      await transaction.update(pipelines).set({ name: input.name, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline.renamed', entityType: 'pipeline', entityId: input.pipelineId, correlationId: input.correlationId, beforeState: { name: current.name }, afterState: { name: input.name } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }

  async setDefault(organizationId: string, actorUserId: string, pipelineId: string, correlationId: string | null): Promise<PipelinesDto | 'not_found'> {
    const result = await database.transaction(async (transaction) => {
      const [target] = await transaction.select({ id: pipelines.id, isDefault: pipelines.isDefault }).from(pipelines)
        .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, pipelineId), eq(pipelines.isActive, true))).for('update').limit(1);
      if (!target) return 'not_found';
      await transaction.update(pipelines).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isDefault, true)));
      await transaction.update(pipelines).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, pipelineId)));
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: 'pipeline.default_changed', entityType: 'pipeline', entityId: pipelineId, correlationId, beforeState: { pipelineId: target.isDefault ? pipelineId : null }, afterState: { pipelineId } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(organizationId, true) : result;
  }

  async archive(input: PipelineRepositoryArchiveDto): Promise<PipelinesDto | 'not_found' | 'default_pipeline' | 'pipeline_in_use'> {
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ name: pipelines.name, isDefault: pipelines.isDefault, isActive: pipelines.isActive }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId))).for('update').limit(1);
      if (!current || !current.isActive) return 'not_found';
      if (current.isDefault) return 'default_pipeline';
      const [used] = await transaction.select({ total: count() }).from(opportunities)
        .where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.pipelineId, input.pipelineId)));
      if (Number(used?.total ?? 0) > 0) return 'pipeline_in_use';
      await transaction.update(pipelines).set({ isActive: false, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline.archived', entityType: 'pipeline', entityId: input.pipelineId, correlationId: input.correlationId, beforeState: { name: current.name, isActive: true }, afterState: { name: current.name, isActive: false } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, true) : result;
  }
}
