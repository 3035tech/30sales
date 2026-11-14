import { Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { database } from '../db';
import { opportunities } from '../db/schema';
import { FunnelReportDto, FunnelReportRepositoryQueryDto, FunnelReportStageDto } from './reports.dto';

const terminalStages = ['won', 'lost'] as const;

@Injectable()
export class ReportsRepository {
  async funnel(input: FunnelReportRepositoryQueryDto): Promise<FunnelReportDto> {
    const from = new Date(`${input.query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const tenant = eq(opportunities.organizationId, input.organizationId);
    const open = and(tenant, notInArray(opportunities.stage, [...terminalStages]));
    const [stageRows, openRows, withoutNextActionRows, overdueRows, createdRows, closedRows, wonAmountRows] = await Promise.all([
      database.select({ stage: opportunities.stage, count: count() }).from(opportunities).where(open).groupBy(opportunities.stage),
      database.select({ count: count() }).from(opportunities).where(open),
      database.select({ count: count() }).from(opportunities).where(and(open, isNull(opportunities.nextActionAt))),
      database.select({ count: count() }).from(opportunities).where(and(open, lt(opportunities.nextActionAt, new Date()))),
      database.select({ count: count() }).from(opportunities).where(and(tenant, gte(opportunities.createdAt, from), lt(opportunities.createdAt, toExclusive))),
      database.select({ stage: opportunities.stage, count: count() }).from(opportunities).where(and(tenant, gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), inArray(opportunities.stage, [...terminalStages]))).groupBy(opportunities.stage),
      database.select({ currency: opportunities.currency, amount: sql<string>`coalesce(sum(${opportunities.amount}), 0)::text` }).from(opportunities).where(and(tenant, eq(opportunities.stage, 'won'), gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), sql`${opportunities.currency} is not null`)).groupBy(opportunities.currency),
    ]);
    const closedCount = (stage: 'won' | 'lost') => Number(closedRows.find((row) => row.stage === stage)?.count ?? 0);
    return new FunnelReportDto(
      input.query.from,
      input.query.to,
      Number(openRows[0]?.count ?? 0),
      Number(withoutNextActionRows[0]?.count ?? 0),
      Number(overdueRows[0]?.count ?? 0),
      stageRows.map((row) => new FunnelReportStageDto(row.stage, Number(row.count))),
      Number(createdRows[0]?.count ?? 0),
      closedCount('won'),
      closedCount('lost'),
      wonAmountRows.filter((row): row is { currency: string; amount: string } => row.currency !== null),
      new Date().toISOString(),
    );
  }
}
