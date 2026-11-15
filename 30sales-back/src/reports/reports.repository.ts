import { Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { database } from '../db';
import { handoffs, leads, opportunities } from '../db/schema';
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
    const [stageRows, openRows, withoutNextActionRows, overdueRows, createdRows, closedRows, wonAmountRows, handoffResponseRows, leadStatusRows, leadCreatedRows] = await Promise.all([
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
    ]);
    const closedCount = (stage: 'won' | 'lost') => Number(closedRows.find((row) => row.stage === stage)?.count ?? 0);
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
      new Date().toISOString(),
    );
  }
}
