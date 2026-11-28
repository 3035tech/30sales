import { Injectable } from '@nestjs/common';
import { and, count, countDistinct, eq, exists, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { assistantRuns, businessLineMembers, businessLines, conversations, handoffs, leadStatusHistory, leads, messages, messagingChannels, opportunities, pipelines, pipelineStages } from '../db/schema';
import { member, user as authUser } from '../db/auth-schema';
import { LEAD_STATUS } from '../leads/constants';
import { AiUsagePointDto, AiUsageReportDto, DailyActivityPointDto, DailyActivityReportDto, DailyActivityRepositoryQueryDto, FunnelReportDto, FunnelReportPipelineValueDto, FunnelReportRepositoryQueryDto, FunnelReportStageAgingDto, FunnelReportStageDto, LeadCohortPointDto, SalesTrendPointDto } from './reports.dto';

const terminalStages = ['won', 'lost'] as const;
const [wonStage, lostStage] = terminalStages;

async function runQueriesInBatches<const Queries extends readonly PromiseLike<unknown>[]>(queries: Queries, batchSize: number): Promise<{ [Index in keyof Queries]: Awaited<Queries[Index]> }> {
  const results: unknown[] = [];
  for (let offset = 0; offset < queries.length; offset += batchSize) {
    results.push(...await Promise.all(queries.slice(offset, offset + batchSize)));
  }
  return results as { [Index in keyof Queries]: Awaited<Queries[Index]> };
}

@Injectable()
export class ReportsRepository {
  async dailyActivity(input: DailyActivityRepositoryQueryDto): Promise<DailyActivityReportDto> {
    const priorMessage = alias(messages, 'prior_activity_message');
    const eligibleActivity = (message: typeof messages | typeof priorMessage) => sql`(${message.deliveryState} in ('accepted', 'delivered', 'read') or ${message.providerMetadata}->'evolution'->>'source' = 'provider_echo')`;
    const activityDate = (message: typeof messages | typeof priorMessage) => input.date
      ? sql`(${message.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = ${input.date}::date`
      : sql`(${message.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date`;
    const priorActivity = exists(database.select({ id: priorMessage.id }).from(priorMessage)
      .where(and(eq(priorMessage.organizationId, input.organizationId), eq(priorMessage.conversationId, conversations.id), eq(priorMessage.direction, 'outbound'), eq(priorMessage.actorType, 'user'), eligibleActivity(priorMessage), sql`(${priorMessage.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date < (${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date`)));
    const rows = await database.select({
      channelId: messagingChannels.id,
      channelName: messagingChannels.displayName,
      phoneNumber: messagingChannels.phoneNumber,
      ownerUserId: messagingChannels.activityOwnerUserId,
      ownerName: authUser.name,
      newContacts: sql<number>`count(distinct ${conversations.id}) filter (where ${messages.id} is not null and not ${priorActivity})::int`,
      continuations: sql<number>`count(distinct ${conversations.id}) filter (where ${messages.id} is not null and ${priorActivity})::int`,
      dailyNewContactGoal: messagingChannels.dailyNewContactGoal,
      dailyContinuationGoal: messagingChannels.dailyContinuationGoal,
      date: input.date
        ? sql<string>`to_char(${input.date}::date, 'YYYY-MM-DD')`
        : sql<string>`to_char((now() at time zone ${messagingChannels.dailyLimitTimeZone})::date, 'YYYY-MM-DD')`,
    }).from(messagingChannels)
      .innerJoin(authUser, eq(authUser.id, messagingChannels.activityOwnerUserId))
      .leftJoin(conversations, and(eq(conversations.organizationId, messagingChannels.organizationId), eq(conversations.channelId, messagingChannels.id), eq(conversations.conversationType, 'direct')))
      .leftJoin(messages, and(eq(messages.organizationId, conversations.organizationId), eq(messages.conversationId, conversations.id), eq(messages.direction, 'outbound'), eq(messages.actorType, 'user'), eligibleActivity(messages), activityDate(messages)))
      .where(and(eq(messagingChannels.organizationId, input.organizationId), isNull(messagingChannels.deletedAt), isNotNull(messagingChannels.activityOwnerUserId), input.userId ? eq(messagingChannels.activityOwnerUserId, input.userId) : undefined, input.businessLineIds === null ? undefined : inArray(messagingChannels.businessLineId, [...input.businessLineIds])))
      .groupBy(messagingChannels.id, authUser.name)
      .orderBy(authUser.name, messagingChannels.displayName);
    return new DailyActivityReportDto(input.date ?? null, rows.map((row) => new DailyActivityPointDto(row.channelId, row.channelName, row.phoneNumber, row.ownerUserId!, row.ownerName, Number(row.newContacts), Number(row.continuations), row.dailyNewContactGoal, row.dailyContinuationGoal, row.date)), new Date().toISOString());
  }

  async isActiveBusinessLine(organizationId: string, businessLineId: string): Promise<boolean> {
    const [line] = await database.select({ id: businessLines.id }).from(businessLines)
      .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.id, businessLineId), eq(businessLines.status, 'active'))).limit(1);
    return Boolean(line);
  }

  async listAccessibleBusinessLineIds(organizationId: string, userId: string): Promise<string[]> {
    const rows = await database.select({ id: businessLines.id }).from(businessLineMembers)
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .innerJoin(member, and(eq(member.id, businessLineMembers.memberId), eq(member.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(member.userId, userId), eq(businessLines.status, 'active')));
    return rows.map(({ id }) => id);
  }

  private opportunityLineScope(input: FunnelReportRepositoryQueryDto) {
    if (input.businessLineIds === null) return undefined;
    return exists(database.select({ id: pipelines.id }).from(pipelines)
      .where(and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, input.organizationId), inArray(pipelines.businessLineId, [...input.businessLineIds]))));
  }

  private handoffLineScope(input: FunnelReportRepositoryQueryDto) {
    if (input.businessLineIds === null) return undefined;
    return exists(database.select({ id: opportunities.id }).from(opportunities)
      .innerJoin(pipelines, and(eq(pipelines.id, opportunities.pipelineId), eq(pipelines.organizationId, opportunities.organizationId)))
      .where(and(eq(opportunities.id, handoffs.opportunityId), eq(opportunities.organizationId, input.organizationId), inArray(pipelines.businessLineId, [...input.businessLineIds]))));
  }

  private assistantLineScope(input: FunnelReportRepositoryQueryDto) {
    if (input.businessLineIds === null) return undefined;
    return exists(database.select({ id: conversations.id }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, assistantRuns.conversationId), eq(conversations.organizationId, input.organizationId), inArray(messagingChannels.businessLineId, [...input.businessLineIds]))));
  }

  private leadLineScope(input: FunnelReportRepositoryQueryDto) {
    return input.businessLineIds === null ? undefined : inArray(leads.businessLineId, [...input.businessLineIds]);
  }

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
      latencySampleCount: count(assistantRuns.latencyMs),
      estimatedCostUsd: sql<string | null>`sum(${assistantRuns.estimatedCostUsd})::text`,
      audioDurationMs: sql<number>`coalesce(sum(${assistantRuns.audioDurationMs}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${assistantRuns.usageInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${assistantRuns.usageOutputTokens}), 0)::int`,
    }).from(assistantRuns)
      .where(and(eq(assistantRuns.organizationId, input.organizationId), gte(assistantRuns.startedAt, from), lt(assistantRuns.startedAt, toExclusive), this.assistantLineScope(input)))
      .groupBy(day, assistantRuns.operation, assistantRuns.status)
      .orderBy(day, assistantRuns.operation, assistantRuns.status);
    return new AiUsageReportDto(input.query.from, input.query.to, rows.map((row) => new AiUsagePointDto(
      row.date, row.operation, row.status, Number(row.runCount), row.averageLatencyMs, Number(row.latencySampleCount),
      row.estimatedCostUsd, Number(row.audioDurationMs), Number(row.inputTokens), Number(row.outputTokens),
    )), new Date().toISOString());
  }

  async funnel(input: FunnelReportRepositoryQueryDto): Promise<FunnelReportDto> {
    const from = new Date(`${input.query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const tenant = and(eq(opportunities.organizationId, input.organizationId), this.opportunityLineScope(input));
    const open = and(tenant, notInArray(opportunities.stage, [...terminalStages]));
    const stageAgeInDays = sql<number>`greatest(0, floor(extract(epoch from (now() - ${opportunities.stageChangedAt})) / 86400))`;
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
    const [stageRows, pipelineValueRows, openRows, withoutNextActionRows, overdueRows, createdRows, closedRows, wonAmountRows, handoffResponseRows, leadStatusRows, leadCreatedRows, leadTrendRows, opportunityTrendRows, closedTrendRows, cohortLeadRows, cohortResponseRows, cohortConvertedToSdrRows, cohortOpportunityRows] = await runQueriesInBatches([
      database.select({
        stage: opportunities.stage,
        pipelineStageKey: opportunities.pipelineStageKey,
        pipelineStageName: pipelineStages.name,
        count: count(),
        upTo7DaysCount: sql<number>`count(*) filter (where ${stageAgeInDays} <= 7)::int`,
        days8To14Count: sql<number>`count(*) filter (where ${stageAgeInDays} between 8 and 14)::int`,
        days15To30Count: sql<number>`count(*) filter (where ${stageAgeInDays} between 15 and 30)::int`,
        over30DaysCount: sql<number>`count(*) filter (where ${stageAgeInDays} > 30)::int`,
      }).from(opportunities).leftJoin(pipelineStages, and(eq(pipelineStages.organizationId, opportunities.organizationId), eq(pipelineStages.pipelineId, opportunities.pipelineId), eq(pipelineStages.key, opportunities.pipelineStageKey))).where(open).groupBy(opportunities.stage, opportunities.pipelineStageKey, pipelineStages.name),
      database.select({ stage: opportunities.stage, pipelineStageKey: opportunities.pipelineStageKey, pipelineStageName: pipelineStages.name, currency: sql<string>`${opportunities.currency}`, amount: sql<string | null>`sum(${opportunities.amount})::text`, opportunityCount: count() }).from(opportunities)
        .leftJoin(pipelineStages, and(eq(pipelineStages.organizationId, opportunities.organizationId), eq(pipelineStages.pipelineId, opportunities.pipelineId), eq(pipelineStages.key, opportunities.pipelineStageKey)))
        .where(and(open, isNotNull(opportunities.amount), isNotNull(opportunities.currency)))
        .groupBy(opportunities.stage, opportunities.pipelineStageKey, pipelineStages.name, opportunities.currency),
      database.select({ count: count(), withoutValueCount: sql<number>`count(*) filter (where ${opportunities.amount} is null or ${opportunities.currency} is null)::int` }).from(opportunities).where(open),
      database.select({ count: count() }).from(opportunities).where(and(open, isNull(opportunities.nextActionAt))),
      database.select({ count: count() }).from(opportunities).where(and(open, lt(opportunities.nextActionAt, new Date()))),
      database.select({ count: count() }).from(opportunities).where(and(tenant, gte(opportunities.createdAt, from), lt(opportunities.createdAt, toExclusive))),
      database.select({ stage: opportunities.stage, count: count() }).from(opportunities).where(and(tenant, gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), inArray(opportunities.stage, [...terminalStages]))).groupBy(opportunities.stage),
      database.select({ currency: opportunities.currency, amount: sql<string>`coalesce(sum(${opportunities.amount}), 0)::text` }).from(opportunities).where(and(tenant, eq(opportunities.stage, 'won'), gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), sql`${opportunities.currency} is not null`)).groupBy(opportunities.currency),
      database.select({ acceptedCount: count(), firstActivityCount: sql<number>`count(${firstActivityAt})::int`, averageMinutes: sql<number | null>`avg(extract(epoch from (${firstActivityAt} - ${handoffs.acceptedAt})) / 60)::float8` })
        .from(handoffs)
        .where(and(eq(handoffs.organizationId, input.organizationId), gte(handoffs.acceptedAt, from), lt(handoffs.acceptedAt, toExclusive), this.handoffLineScope(input))),
      database.select({ status: leads.status, count: count() }).from(leads).where(and(eq(leads.organizationId, input.organizationId), this.leadLineScope(input))).groupBy(leads.status),
      database.select({ count: count() }).from(leads).where(and(eq(leads.organizationId, input.organizationId), this.leadLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive))),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${leads.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, count: count() }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), this.leadLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive))).groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${opportunities.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, count: count() }).from(opportunities)
        .where(and(tenant, gte(opportunities.createdAt, from), lt(opportunities.createdAt, toExclusive))).groupBy(sql`date_trunc('day', ${opportunities.createdAt} at time zone 'UTC')`),
      database.select({ date: sql<string>`to_char(date_trunc('day', ${opportunities.closedAt} at time zone 'UTC'), 'YYYY-MM-DD')`, stage: opportunities.stage, count: count() }).from(opportunities)
        .where(and(tenant, gte(opportunities.closedAt, from), lt(opportunities.closedAt, toExclusive), inArray(opportunities.stage, [...terminalStages])))
        .groupBy(sql`date_trunc('day', ${opportunities.closedAt} at time zone 'UTC')`, opportunities.stage),
      database.select({ date: cohortDate, count: count() }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), this.leadLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leadStatusHistory.leadId) }).from(leadStatusHistory)
        .innerJoin(leads, and(eq(leads.id, leadStatusHistory.leadId), eq(leads.organizationId, leadStatusHistory.organizationId)))
        .where(and(eq(leadStatusHistory.organizationId, input.organizationId), this.leadLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(leadStatusHistory.changedAt, leads.createdAt), lt(leadStatusHistory.changedAt, toExclusive), inArray(leadStatusHistory.toStatus, [LEAD_STATUS.responded, LEAD_STATUS.convertedToSdr])))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leadStatusHistory.leadId) }).from(leadStatusHistory)
        .innerJoin(leads, and(eq(leads.id, leadStatusHistory.leadId), eq(leads.organizationId, leadStatusHistory.organizationId)))
        .where(and(eq(leadStatusHistory.organizationId, input.organizationId), this.leadLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(leadStatusHistory.changedAt, leads.createdAt), lt(leadStatusHistory.changedAt, toExclusive), eq(leadStatusHistory.toStatus, LEAD_STATUS.convertedToSdr)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
      database.select({ date: cohortDate, count: countDistinct(leads.id) }).from(leads)
        .innerJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), this.leadLineScope(input), this.opportunityLineScope(input), gte(leads.createdAt, from), lt(leads.createdAt, toExclusive), gte(opportunities.createdAt, leads.createdAt), lt(opportunities.createdAt, toExclusive)))
        .groupBy(sql`date_trunc('day', ${leads.createdAt} at time zone 'UTC')`),
    ] as const, 6);
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
      Number(openRows[0]?.withoutValueCount ?? 0),
      Number(withoutNextActionRows[0]?.count ?? 0),
      Number(overdueRows[0]?.count ?? 0),
      stageRows.map((row) => new FunnelReportStageDto(row.stage, row.pipelineStageKey, row.pipelineStageName, Number(row.count))),
      stageRows.map((row) => new FunnelReportStageAgingDto(row.stage, row.pipelineStageKey, row.pipelineStageName, Number(row.upTo7DaysCount), Number(row.days8To14Count), Number(row.days15To30Count), Number(row.over30DaysCount))),
      pipelineValueRows.map((row) => new FunnelReportPipelineValueDto(row.stage, row.pipelineStageKey, row.pipelineStageName, row.currency, row.amount ?? '0', Number(row.opportunityCount))),
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
