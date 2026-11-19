import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { member, organization, user } from '../src/db/auth-schema';
import { businessLineMembers, businessLines, pipelines } from '../src/db/schema';
import { BusinessLineCreateCommandDto, BusinessLineMembersCommandDto, BusinessLineUpdateCommandDto, createBusinessLineSchema, updateBusinessLineSchema } from '../src/business-lines/business-lines.dto';

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
  let organizationAId: string;
  let organizationBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let memberAId: string;
  let memberBId: string;
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
  });

  beforeEach(async () => {
    organizationAId = randomUUID();
    organizationBId = randomUUID();
    ownerAId = randomUUID();
    memberAId = randomUUID();
    memberBId = randomUUID();
    ownerBId = randomUUID();
    const ownerAMembershipId = randomUUID();
    const memberAMembershipId = randomUUID();
    const memberBMembershipId = randomUUID();
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
      { id: ownerBId, name: 'Owner B', email: `owner-b-${ownerBId}@example.test`, emailVerified: true },
    ]);
    await database.insert(member).values([
      { id: ownerAMembershipId, organizationId: organizationAId, userId: ownerAId, role: 'owner', createdAt },
      { id: memberAMembershipId, organizationId: organizationAId, userId: memberAId, role: 'sdr', createdAt },
      { id: memberBMembershipId, organizationId: organizationBId, userId: memberBId, role: 'sdr', createdAt },
      { id: ownerBMembershipId, organizationId: organizationBId, userId: ownerBId, role: 'owner', createdAt },
    ]);

    const lineA1 = await createLine(organizationAId, ownerAId, 'Sales Alpha');
    const lineA2 = await createLine(organizationAId, ownerAId, 'Sales Beta');
    const lineB = await createLine(organizationBId, ownerBId, 'Sales Gamma');
    lineA1Id = lineA1.id;
    lineA2Id = lineA2.id;
    lineBId = lineB.id;

    const assigned = await repository.setMembers(new BusinessLineMembersCommandDto(organizationAId, ownerAId, lineA1Id, [ownerAId, memberAId], null));
    if (typeof assigned === 'string') throw new Error(`Could not assign fixture members: ${assigned}`);
  });

  afterEach(async () => {
    if (!database) return;
    await database.delete(organization).where(eq(organization.id, organizationAId));
    await database.delete(organization).where(eq(organization.id, organizationBId));
    await database.delete(user).where(eq(user.id, ownerAId));
    await database.delete(user).where(eq(user.id, ownerBId));
    await database.delete(user).where(eq(user.id, memberAId));
    await database.delete(user).where(eq(user.id, memberBId));
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
