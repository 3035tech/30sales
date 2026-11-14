import { z } from 'zod';

export const funnelReportQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
}).strict().refine((query) => query.from <= query.to, { message: 'The start date must be before or equal to the end date.', path: ['from'] });
export type FunnelReportQueryDto = z.infer<typeof funnelReportQuerySchema>;

export class FunnelReportStageDto { constructor(readonly stage: string, readonly count: number) {} }
export class FunnelReportDto {
  constructor(
    readonly from: string,
    readonly to: string,
    readonly currentOpenCount: number,
    readonly openWithoutNextActionCount: number,
    readonly overdueNextActionCount: number,
    readonly currentStages: FunnelReportStageDto[],
    readonly createdInPeriodCount: number,
    readonly wonInPeriodCount: number,
    readonly lostInPeriodCount: number,
    readonly wonAmountByCurrency: Array<{ currency: string; amount: string }>,
    readonly acceptedHandoffsInPeriodCount: number,
    readonly firstActivityCount: number,
    readonly pendingFirstActivityCount: number,
    readonly averageMinutesToFirstActivity: number | null,
    readonly generatedAt: string,
  ) {}
}
export class FunnelReportRepositoryQueryDto { constructor(readonly organizationId: string, readonly query: FunnelReportQueryDto) {} }
