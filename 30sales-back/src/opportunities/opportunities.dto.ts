import { z } from 'zod';
import { OPPORTUNITY_STAGES, type OpportunityStage } from './opportunities.constants';

const stageSchema = z.enum(OPPORTUNITY_STAGES);

export const listOpportunitiesSchema = z.object({ stage: stageSchema.optional(), opportunityId: z.string().uuid().optional(), view: z.enum(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale']).default('mine'), search: z.string().trim().max(200).optional(), sortBy: z.enum(['nextActionAt', 'accountName', 'contactName', 'stageChangedAt']).default('nextActionAt'), sortDirection: z.enum(['asc', 'desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListOpportunitiesQueryDto = z.infer<typeof listOpportunitiesSchema>;

export const transitionOpportunitySchema = z.object({
  expectedStage: stageSchema,
  stage: stageSchema,
  reason: z.string().trim().max(1000).optional(),
  nextAction: z.string().trim().min(3).max(500).optional(),
  nextActionAt: z.string().datetime({ offset: true }).optional(),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  closedAt: z.string().datetime({ offset: true }).optional(),
  lossReason: z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((input, context) => {
  if (input.stage === input.expectedStage && input.stage !== 'won' && input.stage !== 'lost' && (!input.reason || input.reason.length < 3)) context.addIssue({ code: 'custom', message: 'Add a note when updating an opportunity without changing its stage.', path: ['reason'] });
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
    readonly stage: OpportunityStage,
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
  ) {}
}
export class OpportunityPageDto { constructor(readonly data: OpportunityRecordDto[], readonly pagination: { limit: number; offset: number; total: number; hasNextPage: boolean }) {} }
export class OpportunityHistoryRecordDto { constructor(readonly id: string, readonly fromStage: OpportunityStage | null, readonly toStage: OpportunityStage, readonly actorName: string, readonly reason: string | null, readonly occurredAt: string) {} }
export class OpportunityRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly canEditOwned: boolean, readonly query: ListOpportunitiesQueryDto) {} }
export class OpportunityRepositoryTransitionDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly actorUserId: string, readonly canManageAll: boolean, readonly input: TransitionOpportunityDto, readonly correlationId: string | null = null) {} }
export class OpportunityAssigneeDto { constructor(readonly id: string, readonly name: string) {} }
export class OpportunityRepositoryAssignOwnerDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly ownerUserId: string | null, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class OpportunityRepositoryHistoryDto { constructor(readonly organizationId: string, readonly opportunityId: string) {} }
