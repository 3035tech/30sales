import { z } from 'zod';
import { OPPORTUNITY_STAGES, type OpportunityStage } from './opportunities.constants';
import type { ACTIVITY_TYPES } from './activities.dto';
type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type OpportunityLastActivityDto = { type: ActivityType; subject: string; result: string | null; occurredAt: string };
export type OpportunityConversationContextDto = { conversationId: string; summary: string; confirmedFacts: string[]; unknowns: string[]; capturedAt: string };

export const opportunityStageSchema = z.enum(OPPORTUNITY_STAGES);
const stageSchema = opportunityStageSchema;

export const listOpportunitiesSchema = z.object({
  pipelineId: z.string().uuid().optional(),
  stage: stageSchema.optional(),
  pipelineStageKey: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  view: z.enum(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale']).default('mine'),
  assignedToUserId: z.union([z.literal('unassigned'), z.string().uuid()]).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  noNextAction: z.enum(['true']).optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['nextActionAt', 'accountName', 'contactName', 'stageChangedAt', 'opportunityName', 'stage', 'ownerName']).default('nextActionAt'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
}).strict().superRefine((query, context) => {
  if (query.pipelineStageKey && query.stage !== 'custom') context.addIssue({ code: 'custom', message: 'A custom stage key requires stage=custom.', path: ['pipelineStageKey'] });
  if (query.dueAfter && query.dueBefore && new Date(query.dueAfter) > new Date(query.dueBefore)) context.addIssue({ code: 'custom', message: 'The due date range is invalid.', path: ['dueAfter'] });
});
export type ListOpportunitiesQueryDto = z.infer<typeof listOpportunitiesSchema>;

export const transitionOpportunitySchema = z.object({
  expectedPipelineId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  expectedStage: stageSchema,
  expectedPipelineStageKey: z.string().uuid().optional(),
  stage: stageSchema,
  pipelineStageKey: z.string().uuid().optional(),
  reason: z.string().trim().max(1000).optional(),
  nextAction: z.string().trim().min(3).max(500).optional(),
  nextActionAt: z.string().datetime({ offset: true }).optional(),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  closedAt: z.string().datetime({ offset: true }).optional(),
  lossReason: z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((input, context) => {
  if (input.expectedStage === 'custom' && !input.expectedPipelineStageKey) context.addIssue({ code: 'custom', message: 'The current custom pipeline stage is required.', path: ['expectedPipelineStageKey'] });
  if (input.expectedStage !== 'custom' && input.expectedPipelineStageKey) context.addIssue({ code: 'custom', message: 'A custom pipeline stage can only accompany a custom stage.', path: ['expectedPipelineStageKey'] });
  if (input.stage === 'custom' && !input.pipelineStageKey) context.addIssue({ code: 'custom', message: 'A custom pipeline stage is required.', path: ['pipelineStageKey'] });
  if (input.stage !== 'custom' && input.pipelineStageKey) context.addIssue({ code: 'custom', message: 'A custom pipeline stage can only accompany a custom stage.', path: ['pipelineStageKey'] });
  if (input.stage === input.expectedStage && input.stage !== 'won' && input.stage !== 'lost' && input.expectedPipelineId === input.pipelineId && (!input.reason || input.reason.length < 3)) context.addIssue({ code: 'custom', message: 'Add a note when updating an opportunity without changing its stage.', path: ['reason'] });
  if (input.stage !== 'won' && input.stage !== 'lost' && (!input.nextAction || !input.nextActionAt)) context.addIssue({ code: 'custom', message: 'Open opportunities require a next action and due date.', path: ['nextAction'] });
  if (input.stage === 'won' && (!input.amount || !input.currency || !input.closedAt)) context.addIssue({ code: 'custom', message: 'Won opportunities require amount, currency, and actual close date.', path: ['amount'] });
  if (input.stage === 'won' && input.amount && Number(input.amount) <= 0) context.addIssue({ code: 'custom', message: 'Won opportunity amount must be greater than zero.', path: ['amount'] });
  if (input.stage === 'won' && input.closedAt && new Date(input.closedAt).getTime() > Date.now()) context.addIssue({ code: 'custom', message: 'Close date must be in the past or present.', path: ['closedAt'] });
  if (input.stage === 'lost' && !input.lossReason) context.addIssue({ code: 'custom', message: 'Lost opportunities require a loss reason.', path: ['lossReason'] });
  if (input.amount && Number(input.amount) <= 0) context.addIssue({ code: 'custom', message: 'Opportunity amount must be greater than zero.', path: ['amount'] });
  if (input.amount && !input.currency) context.addIssue({ code: 'custom', message: 'An amount requires a currency.', path: ['currency'] });
});
export type TransitionOpportunityDto = z.infer<typeof transitionOpportunitySchema>;
export const assignOpportunityOwnerSchema = z.object({ ownerUserId: z.string().uuid().nullable() }).strict();
export type AssignOpportunityOwnerDto = z.infer<typeof assignOpportunityOwnerSchema>;

export class OpportunityRecordDto {
  constructor(
    readonly id: string,
    readonly leadId: string,
    readonly name: string,
    readonly accountName: string,
    readonly contactName: string,
    readonly contactEmail: string | null,
    readonly contactPhone: string | null,
    readonly pipelineId: string,
    readonly stage: OpportunityStage,
    readonly pipelineStageKey: string | null,
    readonly pipelineStageName: string | null,
    readonly stageChangedAt: string,
    readonly ownerUserId: string | null,
    readonly ownerName: string | null,
    readonly canUpdate: boolean,
    readonly amount: string | null,
    readonly currency: string | null,
    readonly closedAt: string | null,
    readonly lossReason: string | null,
    readonly nextAction: string | null,
    readonly nextActionAt: string | null,
    readonly createdAt: string,
    readonly updatedAt: string,
    readonly lastActivity: OpportunityLastActivityDto | null = null,
  ) {}
}
export class OpportunityPageDto { constructor(readonly data: OpportunityRecordDto[], readonly pagination: { limit: number; offset: number; total: number; hasNextPage: boolean }) {} }
export class OpportunityConversationContextsQueryDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly userId: string, readonly canManageAll: boolean) {} }
export class OpportunityPipelineSummaryDto {
  constructor(
    readonly openCount: number,
    readonly atRiskCount: number,
    readonly openValueByCurrency: Array<{ currency: string; amount: string }>,
    readonly stageCounts: Array<{ stage: OpportunityStage; pipelineStageKey: string | null; count: number }>,
  ) {}
}
export class OpportunityHistoryRecordDto { constructor(readonly id: string, readonly fromStage: OpportunityStage | null, readonly fromPipelineStageKey: string | null, readonly fromPipelineStageName: string | null, readonly toStage: OpportunityStage, readonly toPipelineStageKey: string | null, readonly toPipelineStageName: string | null, readonly actorName: string, readonly reason: string | null, readonly occurredAt: string) {} }
export class OpportunityRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly canEditOwned: boolean, readonly query: ListOpportunitiesQueryDto) {} }
export class OpportunityRepositoryTransitionDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly actorUserId: string, readonly canManageAll: boolean, readonly input: TransitionOpportunityDto, readonly correlationId: string | null = null) {} }
export class OpportunityAssigneeDto { constructor(readonly id: string, readonly name: string) {} }
export class OpportunityRepositoryAssignOwnerDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly ownerUserId: string | null, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class OpportunityRepositoryHistoryDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly userId: string, readonly canManageAll: boolean) {} }
export const createPipelineSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export type CreatePipelineDto = z.infer<typeof createPipelineSchema>;
export const updatePipelineSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export type UpdatePipelineDto = z.infer<typeof updatePipelineSchema>;
export class PipelineRecordDto { constructor(readonly id: string, readonly name: string, readonly isDefault: boolean, readonly isActive: boolean) {} }
export class PipelinesDto { constructor(readonly pipelines: PipelineRecordDto[], readonly defaultPipelineId: string, readonly canManage: boolean) {} }
export class PipelineRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly name: string, readonly correlationId: string | null) {} }
export class PipelineRepositoryUpdateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly name: string, readonly correlationId: string | null) {} }
export class PipelineRepositoryArchiveDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly correlationId: string | null) {} }
export const createPipelineStageSchema = z.object({ pipelineId: z.string().uuid().optional(), name: z.string().trim().min(2).max(64), afterStageKey: z.string().min(1).max(64) }).strict();
export type CreatePipelineStageDto = z.infer<typeof createPipelineStageSchema>;
export const updatePipelineStageSchema = z.object({ pipelineId: z.string().uuid().optional(), name: z.string().trim().min(2).max(64) }).strict();
export type UpdatePipelineStageDto = z.infer<typeof updatePipelineStageSchema>;
export const reorderPipelineStagesSchema = z.object({ pipelineId: z.string().uuid().optional(), stageKeys: z.array(z.string().min(1).max(1_000)).min(2).max(100) }).strict();
export type ReorderPipelineStagesDto = z.infer<typeof reorderPipelineStagesSchema>;
export class PipelineStageRecordDto { constructor(readonly key: string, readonly stage: OpportunityStage, readonly name: string | null, readonly isSystem: boolean, readonly isActive: boolean, readonly position: number) {} }
export class PipelineStagesDto { constructor(readonly pipelineId: string, readonly stages: PipelineStageRecordDto[], readonly canManage: boolean) {} }
export class PipelineStageRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly name: string, readonly afterStageKey: string, readonly correlationId: string | null) {} }
export class PipelineStageRepositoryUpdateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly key: string, readonly name: string, readonly correlationId: string | null) {} }
export class PipelineStageRepositoryReorderDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly stageKeys: string[], readonly correlationId: string | null) {} }
export class PipelineStageRepositoryArchiveDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly pipelineId: string, readonly key: string, readonly correlationId: string | null) {} }
