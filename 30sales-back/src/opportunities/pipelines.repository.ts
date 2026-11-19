import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, businessLineMembers, businessLines, opportunities, pipelineStages, pipelines } from '../db/schema';
import { member } from '../db/auth-schema';
import { PipelineRecordDto, PipelineRepositoryArchiveDto, PipelineRepositoryCreateDto, PipelineRepositoryUpdateDto, PipelinesDto } from './opportunities.dto';
import { DEFAULT_PIPELINE_STAGES } from './opportunities.constants';

@Injectable()
export class PipelinesRepository {
  async list(organizationId: string, userId: string, canManage: boolean): Promise<PipelinesDto> {
    const defaultPipelineId = await this.ensureDefault(organizationId);
    const rows = await database.select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault, isActive: pipelines.isActive, businessLineId: pipelines.businessLineId, businessLineName: businessLines.name })
      .from(pipelines)
      .leftJoin(businessLines, and(eq(businessLines.organizationId, pipelines.organizationId), eq(businessLines.id, pipelines.businessLineId)))
      .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isActive, true), or(isNull(pipelines.businessLineId), eq(businessLines.status, 'active')), canManage ? undefined : inArray(pipelines.businessLineId, await this.accessibleBusinessLineIds(organizationId, userId)))).orderBy(sql`${pipelines.isDefault} desc`, asc(pipelines.name));
    return new PipelinesDto(rows.map((row) => new PipelineRecordDto(row.id, row.name, row.isDefault, row.isActive, row.businessLineId, row.businessLineName)), defaultPipelineId, canManage);
  }

  async accessibleBusinessLineIds(organizationId: string, userId: string): Promise<string[]> {
    const rows = await database.select({ businessLineId: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(member.userId, userId), eq(businessLines.status, 'active')));
    return rows.map((row) => row.businessLineId);
  }

  async canAccessPipeline(organizationId: string, pipelineId: string, userId: string, canManage: boolean): Promise<boolean> {
    const conditions = [eq(pipelines.organizationId, organizationId), eq(pipelines.id, pipelineId), eq(pipelines.isActive, true), or(isNull(pipelines.businessLineId), eq(businessLines.status, 'active'))];
    if (!canManage) conditions.push(inArray(pipelines.businessLineId, await this.accessibleBusinessLineIds(organizationId, userId)));
    const [pipeline] = await database.select({ id: pipelines.id }).from(pipelines).leftJoin(businessLines, and(eq(businessLines.organizationId, pipelines.organizationId), eq(businessLines.id, pipelines.businessLineId))).where(and(...conditions)).limit(1);
    return pipeline !== undefined;
  }


  async ensureDefault(organizationId: string): Promise<string> {
    const businessLineId = await this.ensureDefaultBusinessLine(organizationId);
    let [defaultPipeline] = await database.select({ id: pipelines.id }).from(pipelines)
      .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.businessLineId, businessLineId), eq(pipelines.isDefault, true), eq(pipelines.isActive, true))).limit(1);
    if (!defaultPipeline) {
      const id = randomUUID();
      await database.insert(pipelines).values({ id, organizationId, businessLineId, name: 'Pipeline principal', isDefault: true, isActive: true }).onConflictDoNothing();
      ;[defaultPipeline] = await database.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.businessLineId, businessLineId), eq(pipelines.isDefault, true), eq(pipelines.isActive, true))).limit(1);
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

  private async ensureDefaultBusinessLine(organizationId: string): Promise<string> {
    return database.transaction(async (transaction) => {
      const [existingDefaultLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.isDefault, true))).limit(1);
      if (existingDefaultLine) return existingDefaultLine.id;
      const [creator] = await transaction.select({ userId: member.userId }).from(member)
        .where(eq(member.organizationId, organizationId)).orderBy(asc(member.createdAt), asc(member.id)).limit(1);
      if (!creator) throw new Error('A default business line requires an active organization member.');
      const slug = `operacao-geral-${organizationId.replaceAll('-', '').slice(0, 8)}`;
      await transaction.insert(businessLines).values({ organizationId, name: 'Operação geral', slug, isDefault: true, createdByUserId: creator.userId }).onConflictDoNothing();
      const [defaultLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.isDefault, true))).limit(1);
      if (!defaultLine) throw new Error('Default business line could not be initialized.');
      const members = await transaction.select({ id: member.id }).from(member).where(eq(member.organizationId, organizationId));
      if (members.length > 0) {
        await transaction.insert(businessLineMembers).values(members.map((organizationMember) => ({ organizationId, businessLineId: defaultLine.id, memberId: organizationMember.id, createdByUserId: creator.userId }))).onConflictDoNothing();
      }
      return defaultLine.id;
    });
  }

  async create(input: PipelineRepositoryCreateDto): Promise<PipelinesDto | 'duplicate_name' | 'limit_reached' | 'business_line_not_found'> {
    const defaultBusinessLineId = await this.ensureDefaultBusinessLine(input.organizationId);
    const businessLineId = input.businessLineId ?? defaultBusinessLineId;
    const [businessLine] = await database.select({ id: businessLines.id }).from(businessLines)
      .where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.id, businessLineId), eq(businessLines.status, 'active'))).limit(1);
    if (!businessLine) return 'business_line_not_found';
    const result = await database.transaction(async (transaction) => {
      const [duplicate] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.businessLineId, businessLineId), eq(pipelines.isActive, true), sql`lower(${pipelines.name}) = lower(${input.name})`)).limit(1);
      if (duplicate) return 'duplicate_name';
      const [total] = await transaction.select({ total: count() }).from(pipelines).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.businessLineId, businessLineId), eq(pipelines.isActive, true)));
      if (Number(total?.total ?? 0) >= 20) return 'limit_reached';
      const id = randomUUID();
      await transaction.insert(pipelines).values({ id, organizationId: input.organizationId, businessLineId, name: input.name, isDefault: false, createdByUserId: input.actorUserId });
      const now = new Date();
      await transaction.insert(pipelineStages).values((['won', 'lost'] as const).map((stage, index) => ({ organizationId: input.organizationId, pipelineId: id, key: `${stage}-${id}`, stage, name: null, position: (index + 1) * 100, isSystem: true, isActive: true, createdByUserId: input.actorUserId, createdAt: now, updatedAt: now })));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline.created', entityType: 'pipeline', entityId: id, correlationId: input.correlationId, afterState: { name: input.name, businessLineId } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.actorUserId, true) : result;
  }

  async update(input: PipelineRepositoryUpdateDto): Promise<PipelinesDto | 'not_found' | 'duplicate_name'> {
    const result = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ name: pipelines.name, businessLineId: pipelines.businessLineId }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId), eq(pipelines.isActive, true))).for('update').limit(1);
      if (!current) return 'not_found';
      const [duplicate] = await transaction.select({ id: pipelines.id }).from(pipelines)
        .where(and(eq(pipelines.organizationId, input.organizationId), current.businessLineId ? eq(pipelines.businessLineId, current.businessLineId) : isNull(pipelines.businessLineId), eq(pipelines.isActive, true), sql`lower(${pipelines.name}) = lower(${input.name})`, sql`${pipelines.id} <> ${input.pipelineId}`)).limit(1);
      if (duplicate) return 'duplicate_name';
      await transaction.update(pipelines).set({ name: input.name, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, input.organizationId), eq(pipelines.id, input.pipelineId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'pipeline.renamed', entityType: 'pipeline', entityId: input.pipelineId, correlationId: input.correlationId, beforeState: { name: current.name }, afterState: { name: input.name } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(input.organizationId, input.actorUserId, true) : result;
  }

  async setDefault(organizationId: string, actorUserId: string, pipelineId: string, correlationId: string | null): Promise<PipelinesDto | 'not_found'> {
    const result = await database.transaction(async (transaction) => {
      const [target] = await transaction.select({ id: pipelines.id, businessLineId: pipelines.businessLineId, isDefault: pipelines.isDefault }).from(pipelines)
        .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, pipelineId), eq(pipelines.isActive, true))).for('update').limit(1);
      if (!target) return 'not_found';
      await transaction.update(pipelines).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, organizationId), target.businessLineId ? eq(pipelines.businessLineId, target.businessLineId) : isNull(pipelines.businessLineId), eq(pipelines.isDefault, true)));
      await transaction.update(pipelines).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, pipelineId)));
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: 'pipeline.default_changed', entityType: 'pipeline', entityId: pipelineId, correlationId, beforeState: { pipelineId: target.isDefault ? pipelineId : null }, afterState: { pipelineId } });
      return 'saved' as const;
    });
    return result === 'saved' ? this.list(organizationId, actorUserId, true) : result;
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
    return result === 'saved' ? this.list(input.organizationId, input.actorUserId, true) : result;
  }
}
