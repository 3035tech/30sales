import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accountPeople, accountSegments, accounts, auditEvents, businessLineMembers, businessLines, leadContacts, leads, opportunities, people } from '../db/schema';
import { member as authMember } from '../db/auth-schema';
import { BUSINESS_LINE_STATUS } from '../business-lines/business-lines.constants';
import { ACCOUNT_CONTACT_RESULT, ACCOUNT_PERSON_AUDIT, ACCOUNT_PERSON_STATUS, ACCOUNT_PROFILE_AUDIT, ACCOUNT_PROFILE_ERROR_CODE, ACCOUNT_SEGMENT_AUDIT, ACCOUNT_SEGMENT_RESULT, DATABASE_UNIQUE_VIOLATION_CODE } from './accounts.constants';
import { AccountContactDto, AccountContactMutationRepositoryDto, AccountContactPageDto, AccountContactsRepositoryDto, AccountPageDto, AccountProfileRepositoryUpdateDto, AccountRecordDto, AccountSegmentDto, AccountSegmentRepositoryAssignDto, AccountSegmentRepositoryCreateDto, AccountsRepositoryListDto } from './accounts.dto';
import type { SQL } from 'drizzle-orm';
import { UNASSIGNED_SEGMENT_FILTER } from '../leads/constants';

type AccountVisibilityScope = Pick<AccountsRepositoryListDto, 'organizationId' | 'userId' | 'canManageAll' | 'includeOwnedOpportunities'> & { query?: Pick<AccountsRepositoryListDto['query'], 'businessLineId'> };

function leadLineMembershipCondition(input: AccountVisibilityScope): SQL {
  return exists(database.select({ id: businessLineMembers.memberId }).from(businessLineMembers)
    .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
    .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
    .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, leads.businessLineId), eq(authMember.userId, input.userId), eq(businessLines.status, BUSINESS_LINE_STATUS.active))));
}

function visibleLeadCondition(input: AccountVisibilityScope): SQL | undefined {
  if (input.canManageAll) return input.query?.businessLineId ? eq(leads.businessLineId, input.query.businessLineId) : undefined;
  const lineMembership = leadLineMembershipCondition(input);
  const selectedLine = input.query?.businessLineId ? eq(leads.businessLineId, input.query.businessLineId) : undefined;
  const assignedLead = eq(leads.assignedToUserId, input.userId);
  if (!input.includeOwnedOpportunities) return and(lineMembership, selectedLine, assignedLead);
  const ownedOpportunity = exists(database.select({ id: opportunities.id }).from(opportunities)
    .where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.leadId, leads.id), eq(opportunities.ownerUserId, input.userId))));
  return and(lineMembership, selectedLine, or(assignedLead, ownedOpportunity));
}

function accountAccessCondition(input: AccountVisibilityScope): SQL | undefined {
  if (input.canManageAll) return undefined;
  return exists(database.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.organizationId, input.organizationId), eq(leads.accountId, accounts.id), visibleLeadCondition(input))));
}

function visibleAccountContactLeadCondition(input: AccountContactsRepositoryDto): SQL {
  return exists(database.select({ id: leads.id }).from(leads).where(and(
    eq(leads.organizationId, input.organizationId), eq(leads.accountId, input.accountId), visibleLeadCondition(input),
    or(eq(leads.personId, people.id), exists(database.select({ id: leadContacts.id }).from(leadContacts)
      .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.personId, people.id))))),
  )));
}

function accountContactCondition(input: AccountContactsRepositoryDto): SQL {
  return and(eq(people.organizationId, input.organizationId), visibleAccountContactLeadCondition(input))!;
}

function visibleOwnedOpportunityCondition(input: AccountsRepositoryListDto): SQL {
  const visibleLead = exists(database.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, input.organizationId), leadLineMembershipCondition(input))));
  return sql`${opportunities.ownerUserId} = ${input.userId} and ${visibleLead}`;
}

@Injectable()
export class AccountsRepository {
  async listContacts(input: AccountContactsRepositoryDto): Promise<AccountContactPageDto | null> {
    const [account] = await database.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId), accountAccessCondition(input))).limit(1);
    if (!account) return null;
    const condition = accountContactCondition(input);
    const [rows, totals] = await Promise.all([
      database.select({ id: people.id, name: people.name, email: people.email, phone: people.phone, status: accountPeople.status }).from(people)
        .leftJoin(accountPeople, and(eq(accountPeople.organizationId, input.organizationId), eq(accountPeople.accountId, input.accountId), eq(accountPeople.personId, people.id)))
        .where(condition).orderBy(asc(people.name), asc(people.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(people).where(condition),
    ]);
    const total = totals[0]?.total ?? 0;
    const contacts = await Promise.all(rows.map(async (person) => {
      const [leadCount] = await database.select({ total: count() }).from(leads).where(and(
        eq(leads.organizationId, input.organizationId), eq(leads.accountId, input.accountId), visibleLeadCondition(input),
        or(eq(leads.personId, person.id), exists(database.select({ id: leadContacts.id }).from(leadContacts)
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.personId, person.id))))),
      ));
      return new AccountContactDto(person.id, person.name, person.email, person.phone, leadCount?.total ?? 0, person.status ?? ACCOUNT_PERSON_STATUS.active);
    }));
    return new AccountContactPageDto(contacts, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }

  async restoreContact(input: AccountContactMutationRepositoryDto): Promise<{ accountId: string; personId: string; status: typeof ACCOUNT_PERSON_STATUS.active } | typeof ACCOUNT_CONTACT_RESULT[keyof typeof ACCOUNT_CONTACT_RESULT]> {
    return database.transaction(async (transaction) => {
      const [account] = await transaction.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId), accountAccessCondition(input))).for('update').limit(1);
      if (!account) return ACCOUNT_CONTACT_RESULT.accountNotFound;
      const [person] = await transaction.select({ id: people.id }).from(people).where(and(eq(people.id, input.personId), accountContactCondition(input))).limit(1);
      if (!person) return ACCOUNT_CONTACT_RESULT.personNotFound;
      const [relation] = await transaction.select({ status: accountPeople.status }).from(accountPeople)
        .where(and(eq(accountPeople.organizationId, input.organizationId), eq(accountPeople.accountId, input.accountId), eq(accountPeople.personId, input.personId))).for('update').limit(1);
      if (!relation || relation.status === ACCOUNT_PERSON_STATUS.active) return ACCOUNT_CONTACT_RESULT.alreadyActive;
      await transaction.update(accountPeople).set({ status: ACCOUNT_PERSON_STATUS.active, revokedByUserId: null, revokedAt: null })
        .where(and(eq(accountPeople.organizationId, input.organizationId), eq(accountPeople.accountId, input.accountId), eq(accountPeople.personId, input.personId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: ACCOUNT_PERSON_AUDIT.actorUser, action: ACCOUNT_PERSON_AUDIT.linked, entityType: ACCOUNT_PERSON_AUDIT.entity, entityId: input.personId, correlationId: input.correlationId, beforeState: { status: ACCOUNT_PERSON_STATUS.revoked, accountId: input.accountId }, afterState: { status: ACCOUNT_PERSON_STATUS.active, accountId: input.accountId } });
      return { accountId: input.accountId, personId: input.personId, status: ACCOUNT_PERSON_STATUS.active };
    });
  }

  async unlinkContact(input: AccountContactMutationRepositoryDto): Promise<{ accountId: string; personId: string; status: typeof ACCOUNT_PERSON_STATUS.revoked } | typeof ACCOUNT_CONTACT_RESULT[keyof typeof ACCOUNT_CONTACT_RESULT]> {
    return database.transaction(async (transaction) => {
      const [account] = await transaction.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId), accountAccessCondition(input))).for('update').limit(1);
      if (!account) return ACCOUNT_CONTACT_RESULT.accountNotFound;
      const [relation] = await transaction.select({ status: accountPeople.status }).from(accountPeople)
        .where(and(eq(accountPeople.organizationId, input.organizationId), eq(accountPeople.accountId, input.accountId), eq(accountPeople.personId, input.personId))).for('update').limit(1);
      if (relation?.status === ACCOUNT_PERSON_STATUS.revoked) return ACCOUNT_CONTACT_RESULT.alreadyRevoked;
      const [person] = await transaction.select({ id: people.id }).from(people).where(and(eq(people.id, input.personId), accountContactCondition(input))).limit(1);
      if (!person) return ACCOUNT_CONTACT_RESULT.personNotFound;
      const revokedAt = new Date();
      await transaction.insert(accountPeople).values({ organizationId: input.organizationId, accountId: input.accountId, personId: input.personId, createdByUserId: input.userId, status: ACCOUNT_PERSON_STATUS.revoked, revokedByUserId: input.userId, revokedAt })
        .onConflictDoUpdate({ target: [accountPeople.organizationId, accountPeople.accountId, accountPeople.personId], set: { status: ACCOUNT_PERSON_STATUS.revoked, revokedByUserId: input.userId, revokedAt } });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: ACCOUNT_PERSON_AUDIT.actorUser, action: ACCOUNT_PERSON_AUDIT.revoked, entityType: ACCOUNT_PERSON_AUDIT.entity, entityId: input.personId, correlationId: input.correlationId, beforeState: { status: relation?.status ?? ACCOUNT_PERSON_AUDIT.legacy }, afterState: { status: ACCOUNT_PERSON_STATUS.revoked, accountId: input.accountId } });
      return { accountId: input.accountId, personId: input.personId, status: ACCOUNT_PERSON_STATUS.revoked };
    });
  }

  async updateProfile(input: AccountProfileRepositoryUpdateDto): Promise<typeof ACCOUNT_PROFILE_ERROR_CODE.notFound | { accountId: string; marketSegment: AccountProfileRepositoryUpdateDto['marketSegment']; studentCount: number | null }> {
    return database.transaction(async (transaction) => {
      const scopeConditions: SQL[] = [eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId)];
      if (!input.canManageAll) {
        const visibleLead = exists(transaction.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.organizationId, input.organizationId), eq(leads.accountId, accounts.id), visibleLeadCondition(input))));
        scopeConditions.push(visibleLead);
      }
      const [account] = await transaction.select({ marketSegment: accounts.marketSegment, studentCount: accounts.studentCount }).from(accounts).where(and(...scopeConditions)).for('update').limit(1);
      if (!account) return ACCOUNT_PROFILE_ERROR_CODE.notFound;
      if (account.marketSegment !== input.marketSegment || account.studentCount !== input.studentCount) {
        await transaction.update(accounts).set({ marketSegment: input.marketSegment, studentCount: input.studentCount, updatedAt: new Date() }).where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId)));
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: ACCOUNT_PROFILE_AUDIT.changed, entityType: ACCOUNT_PROFILE_AUDIT.entity, entityId: input.accountId, correlationId: input.correlationId, beforeState: { marketSegment: account.marketSegment, studentCount: account.studentCount }, afterState: { marketSegment: input.marketSegment, studentCount: input.studentCount } });
      }
      return { accountId: input.accountId, marketSegment: input.marketSegment, studentCount: input.studentCount };
    });
  }
  async listSegments(organizationId: string): Promise<AccountSegmentDto[]> {
    const rows = await database.select({ id: accountSegments.id, name: accountSegments.name }).from(accountSegments).where(eq(accountSegments.organizationId, organizationId)).orderBy(accountSegments.name, accountSegments.id);
    return rows.map((row) => new AccountSegmentDto(row.id, row.name));
  }
  async createSegment(input: AccountSegmentRepositoryCreateDto): Promise<AccountSegmentDto | typeof ACCOUNT_SEGMENT_RESULT.exists> {
    try {
      return await database.transaction(async (transaction) => {
        const [segment] = await transaction.insert(accountSegments).values({ organizationId: input.organizationId, name: input.name, createdByUserId: input.actorUserId }).returning({ id: accountSegments.id, name: accountSegments.name });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: ACCOUNT_SEGMENT_AUDIT.created, entityType: ACCOUNT_SEGMENT_AUDIT.segmentEntity, entityId: segment.id, correlationId: input.correlationId, afterState: { name: segment.name } });
        return new AccountSegmentDto(segment.id, segment.name);
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === DATABASE_UNIQUE_VIOLATION_CODE) return ACCOUNT_SEGMENT_RESULT.exists;
      throw error;
    }
  }
  async assignSegment(input: AccountSegmentRepositoryAssignDto): Promise<{ accountId: string; segmentId: string | null; segmentName: string | null } | typeof ACCOUNT_SEGMENT_RESULT.accountNotFound | typeof ACCOUNT_SEGMENT_RESULT.segmentNotFound> {
    return database.transaction(async (transaction) => {
      const [account] = await transaction.select({ id: accounts.id, segmentId: accounts.segmentId }).from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId))).for('update').limit(1);
      if (!account) return ACCOUNT_SEGMENT_RESULT.accountNotFound;
      let segmentName: string | null = null;
      if (input.segmentId) {
        const [segment] = await transaction.select({ name: accountSegments.name }).from(accountSegments).where(and(eq(accountSegments.id, input.segmentId), eq(accountSegments.organizationId, input.organizationId))).limit(1);
        if (!segment) return ACCOUNT_SEGMENT_RESULT.segmentNotFound;
        segmentName = segment.name;
      }
      if (account.segmentId !== input.segmentId) {
        await transaction.update(accounts).set({ segmentId: input.segmentId, updatedAt: new Date() }).where(and(eq(accounts.id, input.accountId), eq(accounts.organizationId, input.organizationId)));
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: ACCOUNT_SEGMENT_AUDIT.changed, entityType: ACCOUNT_SEGMENT_AUDIT.accountEntity, entityId: input.accountId, correlationId: input.correlationId, beforeState: { segmentId: account.segmentId }, afterState: { segmentId: input.segmentId } });
      }
      return { accountId: input.accountId, segmentId: input.segmentId, segmentName };
    });
  }
  async list(input: AccountsRepositoryListDto): Promise<AccountPageDto> {
    const conditions: SQL[] = [eq(accounts.organizationId, input.organizationId)];
    const accountAccess = accountAccessCondition(input);
    if (accountAccess) conditions.push(accountAccess);
    if (input.query.search) {
      const search = `%${input.query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const matchingAccountName = ilike(accounts.name, search);
      const matchingContact = exists(database.select({ id: leadContacts.id }).from(leadContacts)
        .innerJoin(leads, and(eq(leads.id, leadContacts.leadId), eq(leads.organizationId, leadContacts.organizationId)))
        .innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leads.accountId, accounts.id), visibleLeadCondition(input), ilike(people.name, search))));
      conditions.push(or(matchingAccountName, matchingContact) ?? matchingAccountName);
    }
    if (input.query.leadStatus) {
      conditions.push(exists(database.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), eq(leads.accountId, accounts.id), visibleLeadCondition(input), eq(leads.status, input.query.leadStatus)))));
    }
    if (input.query.segmentId === UNASSIGNED_SEGMENT_FILTER) conditions.push(sql`${accounts.segmentId} is null`);
    else if (input.query.segmentId) conditions.push(eq(accounts.segmentId, input.query.segmentId));
    if (input.query.marketSegment) conditions.push(eq(accounts.marketSegment, input.query.marketSegment));
    if (input.query.withoutMarketSegment) conditions.push(sql`${accounts.marketSegment} is null`);
    if (input.query.studentCountMin !== undefined) conditions.push(gte(accounts.studentCount, input.query.studentCountMin));
    if (input.query.studentCountMax !== undefined) conditions.push(lte(accounts.studentCount, input.query.studentCountMax));
    const where = and(...conditions);
    const totalRows = await database.select({ total: sql<number>`count(distinct ${accounts.id})::int` })
      .from(accounts).leftJoin(leads, and(eq(leads.accountId, accounts.id), eq(leads.organizationId, input.organizationId), visibleLeadCondition(input)))
      .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, input.organizationId)))
      .where(where);
    const contactCount = sql<number>`count(distinct coalesce(${leadContacts.personId}, ${leads.personId}))::int`;
    const leadCount = sql<number>`count(distinct ${leads.id})::int`;
    const respondedCount = sql<number>`count(distinct ${leads.id}) filter (where ${leads.status} in ('responded', 'converted_to_sdr'))::int`;
    const opportunityCount = input.canManageAll
      ? sql<number>`(select count(*)::int from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id})`
      : input.includeOwnedOpportunities
        ? sql<number>`(select count(*)::int from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id} and ${visibleOwnedOpportunityCondition(input)})`
        : sql<number>`0`;
    const latestOpportunityAt = input.canManageAll
      ? sql<Date | null>`(select max(${opportunities.updatedAt}) from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id})`
      : input.includeOwnedOpportunities
        ? sql<Date | null>`(select max(${opportunities.updatedAt}) from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id} and ${visibleOwnedOpportunityCondition(input)})`
        : sql<Date | null>`null`;
    const latestActivityAt = sql<Date | null>`greatest(max(${leads.updatedAt}), ${latestOpportunityAt})`;
    const sortExpressions = {
      accountName: accounts.name,
      segment: accountSegments.name,
      contactCount,
      leadCount,
      respondedCount,
      opportunityCount,
      latestActivityAt,
    };
    const sortExpression = sortExpressions[input.query.sortBy];
    const rows = await database.select({ id: accounts.id, name: accounts.name, segmentId: accounts.segmentId, segmentName: accountSegments.name, marketSegment: accounts.marketSegment, studentCount: accounts.studentCount, contactCount, leadCount, respondedCount, opportunityCount, latestActivityAt })
      .from(accounts)
      .leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId)))
      .leftJoin(leads, and(eq(leads.accountId, accounts.id), eq(leads.organizationId, input.organizationId), visibleLeadCondition(input)))
      .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, input.organizationId)))
      .where(where)
      .groupBy(accounts.id, accountSegments.name)
      .orderBy(input.query.sortDirection === 'asc' ? sortExpression : desc(sortExpression), accounts.name, accounts.id)
      .limit(input.query.limit).offset(input.query.offset);
    const data = rows.map((row) => new AccountRecordDto(row.id, row.name, row.segmentId, row.segmentName, row.marketSegment, row.studentCount, Number(row.contactCount), Number(row.leadCount), Number(row.respondedCount), Number(row.opportunityCount), row.latestActivityAt ? new Date(row.latestActivityAt.toString()).toISOString() : null));
    const total = Number(totalRows[0]?.total ?? 0);
    return new AccountPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }
}
