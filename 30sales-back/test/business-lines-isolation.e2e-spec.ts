import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import { member, organization, user } from '../src/db/auth-schema';
import { accounts, businessLineMembers, businessLines, leadStatusHistory, leads, messagingChannels, opportunities, opportunityStageHistory, people, pipelineStages, pipelines } from '../src/db/schema';
import { BusinessLineCreateCommandDto, BusinessLineMembersCommandDto, BusinessLineUpdateCommandDto, createBusinessLineSchema, updateBusinessLineSchema } from '../src/business-lines/business-lines.dto';
import { OpportunityRepositoryAssignOwnerDto, OpportunityRepositoryTransitionDto, transitionOpportunitySchema } from '../src/opportunities/opportunities.dto';
import { FunnelReportRepositoryQueryDto, funnelReportQuerySchema } from '../src/reports/reports.dto';

const integrationDatabaseUrl = process.env.BUSINESS_LINES_TEST_DATABASE_URL;
const allowedTestDatabase = (() => {
  if (!integrationDatabaseUrl) return false;
  const parsed = new URL(integrationDatabaseUrl);
  return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && /test/i.test(parsed.pathname);
})();

if (integrationDatabaseUrl && !allowedTestDatabase) {
  throw new Error('BUSINESS_LINES_TEST_DATABASE_URL must point to a local database with "test" in its name.');
}

const integrationDescribe = allowedTestDatabase ? describe : describe.skip;
const TEST_AUTH_SECRET = 'business-line-tests-only-secret-value-123456';

integrationDescribe('BusinessLinesRepository isolation (PostgreSQL)', () => {
  let database: (typeof import('../src/db'))['database'];
  let pool: (typeof import('../src/db'))['pool'];
  let BusinessLinesRepository: typeof import('../src/business-lines/business-lines.repository').BusinessLinesRepository;
  let repository: InstanceType<typeof import('../src/business-lines/business-lines.repository').BusinessLinesRepository>;
  let channelsRepository: InstanceType<typeof import('../src/channels/channels.repository').ChannelsRepository>;
  let opportunitiesRepository: InstanceType<typeof import('../src/opportunities/opportunities.repository').OpportunitiesRepository>;
  let reportsRepository: InstanceType<typeof import('../src/reports/reports.repository').ReportsRepository>;
  let organizationAId: string;
  let organizationBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let memberAId: string;
  let memberBId: string;
  let closerA2Id: string;
  let lineA1Id: string;
  let lineA2Id: string;
  let lineBId: string;

  beforeAll(async () => {
    if (!integrationDatabaseUrl) throw new Error('A local integration database URL is required.');
    process.env.DATABASE_URL = integrationDatabaseUrl;
    process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
    process.env.NODE_ENV = 'test';
    const databaseModule = jest.requireActual<typeof import('../src/db')>('../src/db');
    database = databaseModule.database;
    pool = databaseModule.pool;
    const repositoryModule = jest.requireActual<typeof import('../src/business-lines/business-lines.repository')>('../src/business-lines/business-lines.repository');
    BusinessLinesRepository = repositoryModule.BusinessLinesRepository;
    repository = new BusinessLinesRepository();
    const channelsRepositoryModule = jest.requireActual<typeof import('../src/channels/channels.repository')>('../src/channels/channels.repository');
    channelsRepository = new channelsRepositoryModule.ChannelsRepository();
    const opportunitiesRepositoryModule = jest.requireActual<typeof import('../src/opportunities/opportunities.repository')>('../src/opportunities/opportunities.repository');
    opportunitiesRepository = new opportunitiesRepositoryModule.OpportunitiesRepository();
    const reportsRepositoryModule = jest.requireActual<typeof import('../src/reports/reports.repository')>('../src/reports/reports.repository');
    reportsRepository = new reportsRepositoryModule.ReportsRepository();
  });

  beforeEach(async () => {
    organizationAId = randomUUID();
    organizationBId = randomUUID();
    ownerAId = randomUUID();
    memberAId = randomUUID();
    memberBId = randomUUID();
    closerA2Id = randomUUID();
    ownerBId = randomUUID();
    const ownerAMembershipId = randomUUID();
    const memberAMembershipId = randomUUID();
    const memberBMembershipId = randomUUID();
    const closerA2MembershipId = randomUUID();
    const ownerBMembershipId = randomUUID();
    const createdAt = new Date();

    await database.insert(organization).values([
      { id: organizationAId, name: 'Test Company A', slug: `test-a-${organizationAId.slice(0, 8)}`, createdAt },
      { id: organizationBId, name: 'Test Company B', slug: `test-b-${organizationBId.slice(0, 8)}`, createdAt },
    ]);
    await database.insert(user).values([
      { id: ownerAId, name: 'Owner A', email: `owner-a-${ownerAId}@example.test`, emailVerified: true },
      { id: memberAId, name: 'Member A', email: `member-a-${memberAId}@example.test`, emailVerified: true },
      { id: memberBId, name: 'Member B', email: `member-b-${memberBId}@example.test`, emailVerified: true },
      { id: closerA2Id, name: 'Closer A2', email: `closer-a2-${closerA2Id}@example.test`, emailVerified: true },
      { id: ownerBId, name: 'Owner B', email: `owner-b-${ownerBId}@example.test`, emailVerified: true },
    ]);
    await database.insert(member).values([
      { id: ownerAMembershipId, organizationId: organizationAId, userId: ownerAId, role: 'owner', createdAt },
      { id: memberAMembershipId, organizationId: organizationAId, userId: memberAId, role: 'sdr', createdAt },
      { id: memberBMembershipId, organizationId: organizationBId, userId: memberBId, role: 'sdr', createdAt },
      { id: ownerBMembershipId, organizationId: organizationBId, userId: ownerBId, role: 'owner', createdAt },
      { id: closerA2MembershipId, organizationId: organizationAId, userId: closerA2Id, role: 'closer', createdAt },
    ]);

    const lineA1 = await createLine(organizationAId, ownerAId, 'Sales Alpha');
    const lineA2 = await createLine(organizationAId, ownerAId, 'Sales Beta');
    const lineB = await createLine(organizationBId, ownerBId, 'Sales Gamma');
    lineA1Id = lineA1.id;
    lineA2Id = lineA2.id;
    lineBId = lineB.id;

    const assigned = await repository.setMembers(new BusinessLineMembersCommandDto(organizationAId, ownerAId, lineA1Id, [ownerAId, memberAId], null));
    if (typeof assigned === 'string') throw new Error(`Could not assign fixture members: ${assigned}`);
    const assignedToSecondLine = await repository.setMembers(new BusinessLineMembersCommandDto(organizationAId, ownerAId, lineA2Id, [ownerAId, closerA2Id], null));
    if (typeof assignedToSecondLine === 'string') throw new Error(`Could not assign fixture members: ${assignedToSecondLine}`);
    await database.insert(messagingChannels).values([
      { organizationId: organizationAId, businessLineId: lineA1Id, provider: 'evolution', displayName: 'Channel Alpha', phoneNumber: '+5511999990001', providerChannelId: `alpha-${organizationAId.slice(0, 8)}` },
      { organizationId: organizationAId, businessLineId: lineA2Id, provider: 'evolution', displayName: 'Channel Beta', phoneNumber: '+5511999990002', providerChannelId: `beta-${organizationAId.slice(0, 8)}` },
      { organizationId: organizationBId, businessLineId: lineBId, provider: 'evolution', displayName: 'Channel Gamma', phoneNumber: '+5511999990003', providerChannelId: `gamma-${organizationBId.slice(0, 8)}` },
    ]);
  });

  afterEach(async () => {
    if (!database) return;
    await database.delete(organization).where(eq(organization.id, organizationAId));
    await database.delete(organization).where(eq(organization.id, organizationBId));
    await database.delete(user).where(eq(user.id, ownerAId));
    await database.delete(user).where(eq(user.id, ownerBId));
    await database.delete(user).where(eq(user.id, memberAId));
    await database.delete(user).where(eq(user.id, memberBId));
    await database.delete(user).where(eq(user.id, closerA2Id));
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('returns only active lines assigned to a regular member in the same organization', async () => {
    const result = await repository.list(organizationAId, memberAId, false);

    expect(result.data.map(({ id }) => id)).toEqual([lineA1Id]);
    expect(result.data.some(({ id }) => id === lineA2Id || id === lineBId)).toBe(false);
  });

  it('lets a manager see every line in the active organization and never another organization', async () => {
    const result = await repository.list(organizationAId, ownerAId, true);

    expect(new Set(result.data.map(({ id }) => id))).toEqual(new Set([lineA1Id, lineA2Id]));
    expect(result.data.some(({ id }) => id === lineBId)).toBe(false);
  });

  it('hides another tenant line on direct update and membership commands', async () => {
    const update = await repository.update(new BusinessLineUpdateCommandDto(
      organizationAId,
      ownerAId,
      lineBId,
      updateBusinessLineSchema.parse({ name: 'Cross tenant change' }),
      null,
    ));
    const membership = await repository.setMembers(new BusinessLineMembersCommandDto(organizationAId, ownerAId, lineBId, [memberAId], null));

    expect(update).toBe('not_found');
    expect(membership).toBe('not_found');
  });

  it('rejects a user from another tenant when assigning a line team', async () => {
    const result = await repository.setMembers(new BusinessLineMembersCommandDto(organizationAId, ownerAId, lineA1Id, [memberBId], null));

    expect(result).toBe('invalid_members');
    const members = await repository.listMembers(organizationAId, lineA1Id);
    expect(members?.data.map(({ userId }) => userId).sort()).toEqual([ownerAId, memberAId].sort());
  });

  it('limits channel access to the member business lines and active organization', async () => {
    const channelForLine = async (tenantId: string, businessLineId: string) => {
      const [channel] = await database.select({ id: messagingChannels.id }).from(messagingChannels)
        .where(and(eq(messagingChannels.organizationId, tenantId), eq(messagingChannels.businessLineId, businessLineId)));
      if (!channel) throw new Error(`No channel fixture for line ${businessLineId}`);
      return channel;
    };
    const channelA1 = await channelForLine(organizationAId, lineA1Id);
    const channelA2 = await channelForLine(organizationAId, lineA2Id);
    const channelB = await channelForLine(organizationBId, lineBId);

    await expect(channelsRepository.canAccessChannel(organizationAId, channelA1.id, memberAId, false)).resolves.toBe(true);
    await expect(channelsRepository.canAccessChannel(organizationAId, channelA2.id, memberAId, false)).resolves.toBe(false);
    await expect(channelsRepository.canAccessChannel(organizationAId, channelA2.id, ownerAId, true)).resolves.toBe(true);
    await expect(channelsRepository.canAccessChannel(organizationAId, channelB.id, ownerAId, true)).resolves.toBe(false);
  });

  it('limits opportunity access to the member business lines and active organization', async () => {
    const opportunityA1Id = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Alpha opportunity');
    const opportunityA2Id = await createOpportunity(organizationAId, lineA2Id, ownerAId, 'Beta opportunity');
    const opportunityBId = await createOpportunity(organizationBId, lineBId, ownerBId, 'Gamma opportunity');

    await expect(opportunitiesRepository.canAccessOpportunity(organizationAId, opportunityA1Id, memberAId, false)).resolves.toBe(true);
    await expect(opportunitiesRepository.canAccessOpportunity(organizationAId, opportunityA2Id, memberAId, false)).resolves.toBe(false);
    await expect(opportunitiesRepository.canAccessOpportunity(organizationAId, opportunityA2Id, ownerAId, true)).resolves.toBe(true);
    await expect(opportunitiesRepository.canAccessOpportunity(organizationAId, opportunityBId, ownerAId, true)).resolves.toBe(false);
  });

  it('returns each assignable closer with only their active business line memberships', async () => {
    const assignees = await opportunitiesRepository.listAssignees(organizationAId);

    expect(assignees.find(({ id }) => id === closerA2Id)).toEqual({ id: closerA2Id, name: 'Closer A2', businessLineIds: [lineA2Id] });
    expect(assignees.some(({ id }) => id === memberAId || id === ownerAId)).toBe(false);
  });

  it('only assigns opportunities to closers assigned to the same active business line', async () => {
    const opportunityA1Id = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Alpha assignment opportunity');
    const opportunityA2Id = await createOpportunity(organizationAId, lineA2Id, ownerAId, 'Beta assignment opportunity');

    await expect(opportunitiesRepository.assignOwner(new OpportunityRepositoryAssignOwnerDto(organizationAId, opportunityA1Id, closerA2Id, ownerAId))).resolves.toBe('invalid_assignee');
    await expect(opportunitiesRepository.assignOwner(new OpportunityRepositoryAssignOwnerDto(organizationAId, opportunityA2Id, closerA2Id, ownerAId))).resolves.toMatchObject({ id: opportunityA2Id, ownerUserId: closerA2Id });
  });

  it('blocks cross-line pipeline moves and member mutations outside their assigned line', async () => {
    const opportunityA1Id = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Alpha isolation opportunity');
    const opportunityA2Id = await createOpportunity(organizationAId, lineA2Id, ownerAId, 'Beta isolation opportunity');
    const [opportunityA1] = await database.select({ pipelineId: opportunities.pipelineId }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityA1Id)));
    const [opportunityA2] = await database.select({ pipelineId: opportunities.pipelineId }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityA2Id)));
    if (!opportunityA1?.pipelineId || !opportunityA2?.pipelineId) throw new Error('Pipeline fixture was not created.');
    const transitionTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const unauthorizedTransition = transitionOpportunitySchema.parse({
      expectedPipelineId: opportunityA2.pipelineId,
      pipelineId: opportunityA2.pipelineId,
      expectedStage: 'qualification',
      stage: 'closer_contact_pending',
      nextAction: 'Follow up with the prospect',
      nextActionAt: transitionTime,
    });
    await expect(opportunitiesRepository.transition(new OpportunityRepositoryTransitionDto(
      organizationAId, opportunityA2Id, memberAId, false, unauthorizedTransition, null,
    ))).resolves.toBeNull();

    const crossLineMove = transitionOpportunitySchema.parse({
      expectedPipelineId: opportunityA1.pipelineId,
      pipelineId: opportunityA2.pipelineId,
      expectedStage: 'qualification',
      stage: 'qualification',
      reason: 'Move to another business line',
      nextAction: 'Review the opportunity with the team',
      nextActionAt: transitionTime,
    });
    await expect(opportunitiesRepository.transition(new OpportunityRepositoryTransitionDto(
      organizationAId, opportunityA1Id, ownerAId, true, crossLineMove, null,
    ))).resolves.toBe('different_business_line');

    const [unchangedOpportunity] = await database.select({ pipelineId: opportunities.pipelineId, stage: opportunities.stage }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityA1Id)));
    expect(unchangedOpportunity).toEqual({ pipelineId: opportunityA1.pipelineId, stage: 'qualification' });
  });

  it('serializes concurrent stale transitions so only one stage change is recorded', async () => {
    const opportunityId = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Concurrent transition opportunity');
    const [opportunity] = await database.select({ pipelineId: opportunities.pipelineId }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityId)));
    if (!opportunity?.pipelineId) throw new Error('Pipeline fixture was not created.');
    const input = transitionOpportunitySchema.parse({
      expectedPipelineId: opportunity.pipelineId,
      pipelineId: opportunity.pipelineId,
      expectedStage: 'qualification',
      stage: 'closer_contact_pending',
      nextAction: 'Contact the prospect',
      nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const command = () => opportunitiesRepository.transition(new OpportunityRepositoryTransitionDto(
      organizationAId, opportunityId, ownerAId, true, input, null,
    ));

    const results = await Promise.all([command(), command()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    const [current] = await database.select({ stage: opportunities.stage }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityId)));
    const [history] = await database.select({ total: count() }).from(opportunityStageHistory)
      .where(and(eq(opportunityStageHistory.organizationId, organizationAId), eq(opportunityStageHistory.opportunityId, opportunityId)));
    expect(current?.stage).toBe('closer_contact_pending');
    expect(history?.total).toBe(1);
  });

  it('rolls back the opportunity update when recording its transition history fails', async () => {
    const opportunityId = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Rollback transition opportunity');
    const [opportunity] = await database.select({ pipelineId: opportunities.pipelineId }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityId)));
    if (!opportunity?.pipelineId) throw new Error('Pipeline fixture was not created.');
    const input = transitionOpportunitySchema.parse({
      expectedPipelineId: opportunity.pipelineId,
      pipelineId: opportunity.pipelineId,
      expectedStage: 'qualification',
      stage: 'closer_contact_pending',
      nextAction: 'Contact the prospect',
      nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await expect(opportunitiesRepository.transition(new OpportunityRepositoryTransitionDto(
      organizationAId, opportunityId, randomUUID(), true, input, null,
    ))).rejects.toThrow();

    const [current] = await database.select({ stage: opportunities.stage }).from(opportunities)
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityId)));
    const [history] = await database.select({ total: count() }).from(opportunityStageHistory)
      .where(and(eq(opportunityStageHistory.organizationId, organizationAId), eq(opportunityStageHistory.opportunityId, opportunityId)));
    expect(current?.stage).toBe('qualification');
    expect(history?.total).toBe(0);
  });

  it('reconciles funnel totals by line and organization without mixing tenants or currencies', async () => {
    const opportunityA1OpenId = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Alpha open value');
    const opportunityA1WonId = await createOpportunity(organizationAId, lineA1Id, ownerAId, 'Alpha won USD');
    const opportunityA2WonId = await createOpportunity(organizationAId, lineA2Id, ownerAId, 'Beta won EUR');
    const opportunityBWonId = await createOpportunity(organizationBId, lineBId, ownerBId, 'Gamma tenant exclusion');
    const leadIds = new Map<string, string>();
    for (const opportunityId of [opportunityA1OpenId, opportunityA1WonId, opportunityA2WonId, opportunityBWonId]) {
      const [row] = await database.select({ leadId: opportunities.leadId }).from(opportunities)
        .where(eq(opportunities.id, opportunityId));
      if (row) leadIds.set(opportunityId, row.leadId);
    }
    const leadA1OpenId = leadIds.get(opportunityA1OpenId);
    const leadA1WonId = leadIds.get(opportunityA1WonId);
    if (!leadA1OpenId || !leadA1WonId || leadIds.size !== 4) throw new Error('Lead fixtures were not created.');
    const now = new Date();
    const reportDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
    const dateText = reportDate.toISOString().slice(0, 10);
    const historyAt = (minute: number) => new Date(reportDate.getTime() + minute * 60_000);

    await database.update(opportunities).set({ createdAt: reportDate, updatedAt: reportDate, amount: '100.00', currency: 'USD' })
      .where(and(eq(opportunities.organizationId, organizationAId), eq(opportunities.id, opportunityA1OpenId)));
    for (const [opportunityId, amount, currency] of [
      [opportunityA1WonId, '150.00', 'USD'],
      [opportunityA2WonId, '200.00', 'EUR'],
      [opportunityBWonId, '999.00', 'GBP'],
    ] as const) {
      await database.update(opportunities).set({ stage: 'won', amount, currency, closedAt: reportDate, createdAt: reportDate, updatedAt: reportDate })
        .where(eq(opportunities.id, opportunityId));
    }
    await database.update(leads).set({ createdAt: reportDate, updatedAt: reportDate, status: 'responded' })
      .where(and(eq(leads.organizationId, organizationAId), eq(leads.id, leadA1OpenId)));
    await database.update(leads).set({ createdAt: reportDate, updatedAt: reportDate, status: 'converted_to_sdr' })
      .where(and(eq(leads.organizationId, organizationAId), eq(leads.id, leadA1WonId)));
    await database.insert(leadStatusHistory).values([
      { organizationId: organizationAId, leadId: leadA1OpenId, fromStatus: 'new', toStatus: 'responded', changedByUserId: ownerAId, changedAt: historyAt(1) },
      { organizationId: organizationAId, leadId: leadA1WonId, fromStatus: 'new', toStatus: 'responded', changedByUserId: ownerAId, changedAt: historyAt(2) },
      { organizationId: organizationAId, leadId: leadA1WonId, fromStatus: 'responded', toStatus: 'converted_to_sdr', changedByUserId: ownerAId, changedAt: historyAt(3) },
    ]);

    const query = funnelReportQuerySchema.parse({ from: dateText, to: dateText });
    const lineReport = await reportsRepository.funnel(new FunnelReportRepositoryQueryDto(organizationAId, query, [lineA1Id]));
    const portfolioReport = await reportsRepository.funnel(new FunnelReportRepositoryQueryDto(organizationAId, query, null));

    expect(lineReport).toMatchObject({
      currentOpenCount: 1,
      openWithoutValueCount: 0,
      createdInPeriodCount: 2,
      wonInPeriodCount: 1,
      lostInPeriodCount: 0,
      wonAmountByCurrency: [{ currency: 'USD', amount: '150.00' }],
      leadsCreatedInPeriodCount: 2,
      leadCohorts: [{ leadCount: 2, respondedCount: 2, convertedToSdrCount: 1, opportunityCount: 2, respondedRate: 100, convertedToSdrRate: 50, opportunityRate: 100 }],
    });
    expect(lineReport.pipelineValues).toEqual([{ stage: 'qualification', pipelineStageKey: null, pipelineStageName: null, currency: 'USD', amount: '100.00', opportunityCount: 1 }]);
    expect(lineReport.salesTrend).toEqual([{ date: dateText, leadsCreated: 2, opportunitiesCreated: 2, won: 1, lost: 0 }]);
    expect(portfolioReport).toMatchObject({
      currentOpenCount: 1,
      createdInPeriodCount: 3,
      wonInPeriodCount: 2,
      lostInPeriodCount: 0,
      leadsCreatedInPeriodCount: 3,
      leadCohorts: [{ leadCount: 3, respondedCount: 2, convertedToSdrCount: 1, opportunityCount: 3, respondedRate: 66.7, convertedToSdrRate: 33.3, opportunityRate: 100 }],
    });
    expect(portfolioReport.wonAmountByCurrency).toEqual(expect.arrayContaining([
      { currency: 'USD', amount: '150.00' },
      { currency: 'EUR', amount: '200.00' },
    ]));
    expect(portfolioReport.wonAmountByCurrency).toHaveLength(2);
    expect(portfolioReport.salesTrend).toEqual([{ date: dateText, leadsCreated: 3, opportunitiesCreated: 3, won: 2, lost: 0 }]);
  });

  it('backfills legacy pipeline data to one default line and remains idempotent', async () => {
    const legacyOrganizationId = randomUUID();
    const legacyUserId = randomUUID();
    const legacyMemberId = randomUUID();
    const legacyPipelineId = randomUUID();
    const createdAt = new Date();
    try {
      await database.insert(organization).values({ id: legacyOrganizationId, name: 'Legacy Test Company', slug: `legacy-test-${legacyOrganizationId.slice(0, 8)}`, createdAt });
      await database.insert(user).values({ id: legacyUserId, name: 'Legacy Owner', email: `legacy-${legacyUserId}@example.test`, emailVerified: true });
      await database.insert(member).values({ id: legacyMemberId, organizationId: legacyOrganizationId, userId: legacyUserId, role: 'owner', createdAt });
      await database.insert(pipelines).values({ id: legacyPipelineId, organizationId: legacyOrganizationId, name: 'Legacy pipeline', businessLineId: null, createdByUserId: legacyUserId });

      runRuntimeMigrations();
      runRuntimeMigrations();

      const [legacyPipeline] = await database.select({ businessLineId: pipelines.businessLineId }).from(pipelines)
        .where(and(eq(pipelines.id, legacyPipelineId), eq(pipelines.organizationId, legacyOrganizationId)));
      const legacyLines = await database.select().from(businessLines).where(eq(businessLines.organizationId, legacyOrganizationId));
      const legacyMemberships = await database.select().from(businessLineMembers)
        .where(eq(businessLineMembers.organizationId, legacyOrganizationId));

      expect(legacyPipeline?.businessLineId).toBe(legacyLines[0]?.id);
      expect(legacyLines).toHaveLength(1);
      expect(legacyLines[0]?.isDefault).toBe(true);
      expect(legacyMemberships).toHaveLength(1);
      expect(legacyMemberships[0]?.memberId).toBe(legacyMemberId);
    } finally {
      await database.delete(organization).where(eq(organization.id, legacyOrganizationId));
      await database.delete(user).where(eq(user.id, legacyUserId));
    }
  });

  async function createLine(tenantId: string, actorId: string, name: string) {
    const input = createBusinessLineSchema.parse({ name, slug: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID().slice(0, 8)}` });
    const result = await repository.create(new BusinessLineCreateCommandDto(tenantId, actorId, input, null));
    if (typeof result === 'string') throw new Error(`Could not create fixture line: ${result}`);
    return result;
  }

  async function createOpportunity(tenantId: string, businessLineId: string, actorId: string, name: string): Promise<string> {
    const accountId = randomUUID();
    const personId = randomUUID();
    const leadId = randomUUID();
    const pipelineId = randomUUID();
    const opportunityId = randomUUID();
    await database.insert(accounts).values({ id: accountId, organizationId: tenantId, name: `${name} account` });
    await database.insert(people).values({ id: personId, organizationId: tenantId, name: `${name} contact` });
    await database.insert(leads).values({ id: leadId, organizationId: tenantId, businessLineId, accountId, personId, createdByUserId: actorId });
    await database.insert(pipelines).values({ id: pipelineId, organizationId: tenantId, businessLineId, name: `${name} pipeline`, createdByUserId: actorId });
    await database.insert(pipelineStages).values([
      { organizationId: tenantId, pipelineId, key: `qualification-${pipelineId}`, stage: 'qualification', position: 1, isSystem: true, createdByUserId: actorId },
      { organizationId: tenantId, pipelineId, key: `closer-contact-pending-${pipelineId}`, stage: 'closer_contact_pending', position: 2, isSystem: true, createdByUserId: actorId },
    ]);
    await database.insert(opportunities).values({ id: opportunityId, organizationId: tenantId, leadId, accountId, primaryPersonId: personId, name, pipelineId, createdByUserId: actorId });
    return opportunityId;
  }

  function runRuntimeMigrations(): void {
    if (!integrationDatabaseUrl) throw new Error('A local integration database URL is required.');
    execFileSync(process.execPath, [join(__dirname, '../dist/src/db/migrate.js')], {
      env: {
        ...process.env,
        DATABASE_URL: integrationDatabaseUrl,
        BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });
  }
});
