import { z } from 'zod';

export const funnelReportQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  businessLineId: z.string().uuid().optional(),
}).strict().refine((query) => query.from <= query.to, { message: 'The start date must be before or equal to the end date.', path: ['from'] });
export const dailyActivityQuerySchema = z.object({ date: z.string().date().optional(), businessLineId: z.string().uuid().optional(), scope: z.enum(['mine', 'team']).default('mine') }).strict();
export type DailyActivityQueryDto = z.infer<typeof dailyActivityQuerySchema>;
export type FunnelReportQueryDto = z.infer<typeof funnelReportQuerySchema>;

export class FunnelReportStageDto { constructor(readonly stage: string, readonly pipelineStageKey: string | null, readonly pipelineStageName: string | null, readonly count: number) {} }
export class FunnelReportStageAgingDto {
  constructor(
    readonly stage: string,
    readonly pipelineStageKey: string | null,
    readonly pipelineStageName: string | null,
    readonly upTo7DaysCount: number,
    readonly days8To14Count: number,
    readonly days15To30Count: number,
    readonly over30DaysCount: number,
  ) {}
}
export class FunnelReportPipelineValueDto {
  constructor(
    readonly stage: string,
    readonly pipelineStageKey: string | null,
    readonly pipelineStageName: string | null,
    readonly currency: string,
    readonly amount: string,
    readonly opportunityCount: number,
  ) {}
}
export class FunnelReportDto {
  constructor(
    readonly from: string,
    readonly to: string,
    readonly currentOpenCount: number,
    readonly openWithoutValueCount: number,
    readonly openWithoutNextActionCount: number,
    readonly overdueNextActionCount: number,
    readonly currentStages: FunnelReportStageDto[],
    readonly stageAging: FunnelReportStageAgingDto[],
    readonly pipelineValues: FunnelReportPipelineValueDto[],
    readonly createdInPeriodCount: number,
    readonly wonInPeriodCount: number,
    readonly lostInPeriodCount: number,
    readonly wonAmountByCurrency: Array<{ currency: string; amount: string }>,
    readonly acceptedHandoffsInPeriodCount: number,
    readonly firstActivityCount: number,
    readonly pendingFirstActivityCount: number,
    readonly averageMinutesToFirstActivity: number | null,
    readonly leadCountsByStatus: Array<{ status: string; count: number }>,
    readonly leadsCreatedInPeriodCount: number,
    readonly salesTrend: SalesTrendPointDto[],
    readonly leadCohorts: LeadCohortPointDto[],
    readonly generatedAt: string,
  ) {}
}
export class FunnelReportRepositoryQueryDto { constructor(readonly organizationId: string, readonly query: FunnelReportQueryDto, readonly businessLineIds: readonly string[] | null) {} }
export class DailyActivityPointDto {
  constructor(readonly channelId: string, readonly channelName: string, readonly phoneNumber: string, readonly ownerUserId: string, readonly ownerName: string, readonly newContacts: number, readonly continuations: number, readonly dailyNewContactGoal: number | null, readonly dailyContinuationGoal: number | null, readonly date: string) {}
}
export class DailyActivityReportDto { constructor(readonly date: string | null, readonly points: DailyActivityPointDto[], readonly generatedAt: string) {} }
export class DailyActivityRepositoryQueryDto { constructor(readonly organizationId: string, readonly userId: string | null, readonly date: string | undefined, readonly businessLineIds: readonly string[] | null) {} }
export class AiUsagePointDto {
  constructor(readonly date: string, readonly operation: string, readonly status: string, readonly runCount: number, readonly averageLatencyMs: number | null, readonly latencySampleCount: number, readonly estimatedCostUsd: string | null, readonly audioDurationMs: number, readonly inputTokens: number, readonly outputTokens: number) {}
}
export class AiUsageReportDto {
  constructor(readonly from: string, readonly to: string, readonly points: AiUsagePointDto[], readonly generatedAt: string) {}
}
export class SalesTrendPointDto {
  constructor(readonly date: string, readonly leadsCreated: number, readonly opportunitiesCreated: number, readonly won: number, readonly lost: number) {}
}
export class LeadCohortPointDto {
  constructor(
    readonly date: string,
    readonly ageDays: number,
    readonly leadCount: number,
    readonly respondedCount: number,
    readonly convertedToSdrCount: number,
    readonly opportunityCount: number,
    readonly respondedRate: number,
    readonly convertedToSdrRate: number,
    readonly opportunityRate: number,
  ) {}
}
