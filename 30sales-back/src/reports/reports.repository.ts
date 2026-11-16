import { Injectable } from '@nestjs/common';
import { and, count, countDistinct, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { database } from '../db';
import { assistantRuns, handoffs, leadStatusHistory, leads, opportunities } from '../db/schema';
import { LEAD_STATUS } from '../leads/constants';
import { AiUsagePointDto, AiUsageReportDto, FunnelReportDto, FunnelReportRepositoryQueryDto, FunnelReportStageDto, LeadCohortPointDto, SalesTrendPointDto } from './reports.dto';

const terminalStages = ['won', 'lost'] as const;
const [wonStage, lostStage] = terminalStages;
@Injectable()
export class ReportsRepository {
  async aiUsage(input: FunnelReportRepositoryQueryDto): Promise<AiUsageReportDto> {
    const from = new Date(`${input.query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const day = sql<string>`to_char(date_trunc('day', ${assistantRuns.startedAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const rows = await database.select({
      date: day,
      operation: assistantRuns.operation,
      status: assistantRuns.status,
      runCount: count(),
      averageLatencyMs: sql<number | null>`avg(${assistantRuns.latencyMs})::float8`,
      estimatedCostUsd: sql<string | null>`sum(${assistantRuns.estimatedCostUsd})::text`,
      audioDurationMs: sql<number>`coalesce(sum(${assistantRuns.audioDurationMs}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${assistantRuns.usageInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${assistantRuns.usageOutputTokens}), 0)::int`,
    }).from(assistantRuns)
      .where(and(eq(assistantRuns.organizationId, input.organizationId), gte(assistantRuns.startedAt, from), lt(assistantRuns.startedAt, toExclusive)))
      .groupBy(day, assistantRuns.operation, assistantRuns.status)
      .orderBy(day, assistantRuns.operation, assistantRuns.status);
    return new AiUsageReportDto(input.query.from, input.query.to, rows.map((row) => new AiUsagePointDto(
      row.date, row.operation, row.status, Number(row.runCount), row.averageLatencyMs,
      row.estimatedCostUsd, Number(row.audioDurationMs), Number(row.inputTokens), Number(row.outputTokens),
    )), new Date().toISOString());
  }

  async funnel(input: FunnelReportRepositoryQueryDto): Promise<FunnelReportDto> {
    const from = new Date(`${input.query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const tenant = eq(opportunities.organizationId, input.organizationId);
    const open = and(tenant, notInArray(opportunities.stage, [...terminalStages]));
    const firstActivityAt = sql<Date | null>`(
      select min(first_activity.occurred_at) from (
        select activity.occurred_at from activities activity
        where activity.organization_id = ${handoffs.organizationId}
          and activity.opportunity_id = ${handoffs.opportunityId}
          and activity.type in ('call', 'meeting', 'email', 'message')
          and activity.occurred_at >= ${handoffs.acceptedAt}
        union all
        select message.occurred_at from messages message
        inner join conversations conversation on conversation.id = message.conversation_id and conversation.organization_id = message.organization_id
        where conversation.organization_id = ${handoffs.organizationId}
          and conversation.opportunity_id = ${handoffs.opportunityId}
          and message.direction = 'outbound' and message.actor_type = 'user'
          and message.delivery_state in ('accepted', 'delivered', 'read')
          and message.occurred_at >= ${handoffs.acceptedAt}
      ) first_activity
    )`;
    const cohortDate = sql<string>`to_char(date_trunc('day', ${leads.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const [stageRows, openRows, withoutNextActionRows, overdueRows, createdRows, closedRows, wonAmountRows, handoffResponseRows, leadStatusRows, leadCreatedRows, leadTrendRows, opportunityTrendRows, closedTrendRows, cohortLeadRows, cohortResponseRows, cohortConvertedToSdrRows, cohortOpportunityRows] = await Promise.all([
      database.select({ stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, count: count() }).from(opportunities).where(open).groupBy(opportunities.stage, opportunities.pipelineStageKey),
      database.select({ count: count() }).from(opportunities).where(open),
      database.select({ count: count() }).from(opportunities).where(and(open, isNull(opportunities.nextActionAt))),
      database.select({ count: count() }).from(opportunities).where(and(open, lt(opportunities.nextActionAt, new Date()))),
      database.select({ count: count() }).from(opportunities).where(and(tenant, gte(opportunities.createdAt, from), lt(opportunities.createdAt, toExclusive))),
      database.select({ stage: opportunities.stage, count: count() }).from(opportunities).where(and(tenant, gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), inArray(opportunities.stage, [...terminalStages]))).groupBy(opportunities.stage),
      database.select({ currency: opportunities.currency, amount: sql<string>`coalesce(sum(${opportunities.amount}), 0)::text` }).from(opportunities).where(and(tenant, eq(opportunities.stage, 'won'), gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), sql`${opportunities.currency} is not null`)).groupBy(opportunities.currency),
      database.select({ acceptedCount: count(), firstActivityCount: sql<number>`count(${firstActivityAt})::int`, averageMinutes: sql<number | null>`avg(extract(epoch from (${firstActivityAt} - ${handoffs.acceptedAt})) / 60)::float8` })
        .from(handoffs)
        .where(and(eq(handoffs.organizationId, input.organizationId), gte(handoffs.acceptedAt, from), lt(handoffs.acceptedAt, toExclusive))),
      database.select({ status: leads.status, count: count() }).from(leads).where(eq(leads.organizationId, input.organizationId)).groupBy(leads.status),
      database.select({ count: count() }).from(leads).where(and(eq(leads.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive))),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${leads.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, count: count() }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive))).groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${opportunities.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, count: count() }).from(opportunities)
        .where(and(tenant, gte(opportunities.createdAt, from), lt(opportunities.createdAt, toExclusive))).groupBy(sql`date_trunc('day', ${opportunities.createdAt} at time zone 'UTC')`),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${opportunities.closedAt} at time zone 'UTC'), 'YYYY-MM-DD')`, stage: opportunities.stage, count: count() }).from(opportunities)
        .where(and(tenant, gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), inArray(opportunities.stage, [...terminalStages])))
        .groupBy(sql`date_trunc('day', ${opportunities.closedAt} at time zone 'UTC')`, opportunities.stage),
      database.select({ date: cohortDate, count: count() }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leadStatusHistory.leadId) }).from(leadStatusHistory)
        .innerJoin(leads, and(eq(leads.id, leadStatusHistory.leadId), eq(leads.organizationId, leadStatusHistory.organizationId)))
        .where(and(eq(leadStatusHistory.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(leadStatusHistory.changedAt, leads.createdAt), lt(leadStatusHistory.changedAt, toExclusive), inArray(leadStatusHistory.toStatus, [LEAD_STATUS.responded, LEAD_STATUS.convertedToSdr])))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leadStatusHistory.leadId) }).from(leadStatusHistory)
        .innerJoin(leads, and(eq(leads.id, leadStatusHistory.leadId), eq(leads.organizationId, leadStatusHistory.organizationId)))
        .where(and(eq(leadStatusHistory.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(leadStatusHistory.changedAt, leads.createdAt), lt(leadStatusHistory.changedAt, toExclusive), eq(leadStatusHistory.toStatus, LEAD_STATUS.convertedToSdr)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leads.id) }).from(leads)
        .innerJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(opportunities.createdAt, leads.createdAt), lt(opportunities.createdAt, toExclusive)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
    ]);
    const closedCount = (stage: 'won' | 'lost') => Number(closedRows.find((row) => row.stage === stage)?.count ?? 0);
    const trends = new Map<string, { leads: number; opportunities: number; won: number; lost: number }>();
    const trendFor = (date: string) => {
      const existing = trends.get(date);
      if (existing) return existing;
      const created = { leads: 0, opportunities: 0, won: 0, lost: 0 };
      trends.set(date, created);
      return created;
    };
    for (const row of leadTrendRows) trendFor(row.date).leads = Number(row.count);
    for (const row of opportunityTrendRows) trendFor(row.date).opportunities = Number(row.count);
    for (const row of closedTrendRows) {
      const trend = trendFor(row.date);
      if (row.stage === wonStage) trend.won = Number(row.count);
      if (row.stage === lostStage) trend.lost = Number(row.count);
    }
    const salesTrend = [...trends.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, item]) => new SalesTrendPointDto(date, item.leads, item.opportunities, item.won, item.lost));
    const cohorts = new Map<string, { leadCount: number; respondedCount: number; convertedToSdrCount: number; opportunityCount: number }>();
    const cohortFor = (date: string) => {
      const existing = cohorts.get(date);
      if (existing) return existing;
      const created = { leadCount: 0, respondedCount: 0, convertedToSdrCount: 0, opportunityCount: 0 };
      cohorts.set(date, created);
      return created;
    };
    for (const row of cohortLeadRows) cohortFor(row.date).leadCount = Number(row.count);
    for (const row of cohortResponseRows) cohortFor(row.date).respondedCount = Number(row.count);
    for (const row of cohortConvertedToSdrRows) cohortFor(row.date).convertedToSdrCount = Number(row.count);
    for (const row of cohortOpportunityRows) cohortFor(row.date).opportunityCount = Number(row.count);
    const reportEnd = new Date(`${input.query.to}T00:00:00.000Z`);
    const rate = (numerator: number, denominator: number) => denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
    const leadCohorts = [...cohorts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, cohort]) => {
      const cohortStart = new Date(`${date}T00:00:00.000Z`);
      const ageDays = Math.max(0, Math.floor((reportEnd.getTime() - cohortStart.getTime()) / 86_400_000));
      return new LeadCohortPointDto(date, ageDays, cohort.leadCount, cohort.respondedCount, cohort.convertedToSdrCount, cohort.opportunityCount,
        rate(cohort.respondedCount, cohort.leadCount), rate(cohort.convertedToSdrCount, cohort.leadCount), rate(cohort.opportunityCount, cohort.leadCount));
    });
    return new FunnelReportDto(
      input.query.from,
      input.query.to,
      Number(openRows[0]?.count ?? 0),
      Number(withoutNextActionRows[0]?.count ?? 0),
      Number(overdueRows[0]?.count ?? 0),
      stageRows.map((row) => new FunnelReportStageDto(row.stage, row.pipelineStageKey, Number(row.count))),
      Number(createdRows[0]?.count ?? 0),
      closedCount('won'),
      closedCount('lost'),
      wonAmountRows.filter((row): row is { currency: string; amount: string } => row.currency !== null),
      Number(handoffResponseRows[0]?.acceptedCount ?? 0),
      Number(handoffResponseRows[0]?.firstActivityCount ?? 0),
      Number(handoffResponseRows[0]?.acceptedCount ?? 0) - Number(handoffResponseRows[0]?.firstActivityCount ?? 0),
      handoffResponseRows[0]?.averageMinutes ?? null,
      leadStatusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
      Number(leadCreatedRows[0]?.count ?? 0),
      salesTrend,
      leadCohorts,
      new Date().toISOString(),
    );
  }
}
