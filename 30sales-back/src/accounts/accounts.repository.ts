import { Injectable } from '@nestjs/common';
import { and, desc, eq, exists, ilike, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, leads, opportunities, people } from '../db/schema';
import { AccountPageDto, AccountRecordDto, AccountsRepositoryListDto } from './accounts.dto';

@Injectable()
export class AccountsRepository {
  async list(input: AccountsRepositoryListDto): Promise<AccountPageDto> {
    const conditions = [eq(accounts.organizationId, input.organizationId)];
    if (input.query.search) {
      const search = `%${input.query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(accounts.name, search), exists(database.select({ id: leads.id }).from(leads)
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), eq(leads.accountId, accounts.id), ilike(people.name, search)))))!);
    }
    if (input.query.leadStatus) {
      conditions.push(exists(database.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), eq(leads.accountId, accounts.id), eq(leads.status, input.query.leadStatus)))));
    }
    const where = and(...conditions);
    const totalRows = await database.select({ total: sql<number>`count(distinct ${accounts.id})::int` })
      .from(accounts).leftJoin(leads, and(eq(leads.accountId, accounts.id), eq(leads.organizationId, input.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, input.organizationId)))
      .where(where);
    const contactCount = sql<number>`count(distinct ${people.id})::int`;
    const leadCount = sql<number>`count(distinct ${leads.id})::int`;
    const respondedCount = sql<number>`count(distinct ${leads.id}) filter (where ${leads.status} in ('responded', 'converted_to_sdr'))::int`;
    const opportunityCount = sql<number>`(select count(*)::int from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id})`;
    const latestActivityAt = sql<Date | null>`greatest(max(${leads.updatedAt}), (select max(${opportunities.updatedAt}) from ${opportunities} where ${opportunities.organizationId} = ${input.organizationId} and ${opportunities.accountId} = ${accounts.id}))`;
    const sortExpressions = {
      accountName: accounts.name,
      contactCount,
      leadCount,
      respondedCount,
      opportunityCount,
      latestActivityAt,
    };
    const sortExpression = sortExpressions[input.query.sortBy];
    const rows = await database.select({ id: accounts.id, name: accounts.name, contactCount, leadCount, respondedCount, opportunityCount, latestActivityAt })
      .from(accounts)
      .leftJoin(leads, and(eq(leads.accountId, accounts.id), eq(leads.organizationId, input.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, input.organizationId)))
      .where(where)
      .groupBy(accounts.id)
      .orderBy(input.query.sortDirection === 'asc' ? sortExpression : desc(sortExpression), accounts.name, accounts.id)
      .limit(input.query.limit).offset(input.query.offset);
    const data = rows.map((row) => new AccountRecordDto(row.id, row.name, Number(row.contactCount), Number(row.leadCount), Number(row.respondedCount), Number(row.opportunityCount), row.latestActivityAt ? new Date(row.latestActivityAt.toString()).toISOString() : null));
    const total = Number(totalRows[0]?.total ?? 0);
    return new AccountPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }
}
