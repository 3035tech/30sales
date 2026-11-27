import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { database } from '../db';
import { businessLines, pipelineStages, pipelines } from '../db/schema';
import { DEFAULT_PIPELINE_STAGES } from './opportunities.constants';

type OpportunityTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

export async function findLineDefaultPipelineId(
  transaction: OpportunityTransaction,
  organizationId: string,
  businessLineId: string | null,
): Promise<string | null> {
  if (!businessLineId) return null;

  const [line] = await transaction.select({ id: businessLines.id }).from(businessLines)
    .where(and(eq(businessLines.id, businessLineId), eq(businessLines.organizationId, organizationId), eq(businessLines.status, 'active')))
    .for('share').limit(1);
  if (!line) return null;

  const [pipeline] = await transaction.select({ id: pipelines.id }).from(pipelines)
    .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.businessLineId, businessLineId), eq(pipelines.isActive, true), eq(pipelines.isDefault, true)))
    .for('share').limit(1);
  if (!pipeline) return null;

  const existingStages = await transaction.select({ stage: pipelineStages.stage }).from(pipelineStages)
    .where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, pipeline.id), eq(pipelineStages.isSystem, true), inArray(pipelineStages.stage, DEFAULT_PIPELINE_STAGES.map(({ key }) => key))));
  const existingStageValues = new Set(existingStages.map(({ stage }) => stage));
  const missingStages = DEFAULT_PIPELINE_STAGES.filter(({ key }) => !existingStageValues.has(key));
  if (missingStages.length > 0) {
    const now = new Date();
    await transaction.insert(pipelineStages).values(missingStages.map(({ key, position }) => ({
    organizationId,
    pipelineId: pipeline.id,
    key: `${key}-${pipeline.id}`,
    stage: key,
    name: null,
    position,
    isSystem: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    }))).onConflictDoNothing({ target: [pipelineStages.organizationId, pipelineStages.key] });
  }

  return pipeline.id;
}
