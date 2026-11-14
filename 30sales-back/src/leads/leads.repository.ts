import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, lt, min, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, leadStatusHistory, leads, people, tasks } from '../db/schema';
import { LeadPageDto, LeadRecordDto, LeadRepositoryCreateDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto } from './leads.dto';

function mapLead(row: { leadId: string; accountName: string; contactName: string; email: string | null; phone: string | null; source: string; status: LeadRecordDto['status']; nextActionAt: Date | null; createdAt: Date; updatedAt: Date }): LeadRecordDto {
  return new LeadRecordDto(row.leadId, row.accountName, row.contactName, row.email, row.phone, row.source, row.status, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString());
}
@Injectable()
export class LeadsRepository {
  async listTasks(input: TaskRepositoryListDto): Promise<TaskRecordDto[]> {
    const conditions = [eq(tasks.organizationId, input.organizationId), eq(tasks.status, input.query.status)];
    if (input.query.from) conditions.push(gte(tasks.dueAt, new Date(input.query.from)));
    if (input.query.to) conditions.push(lt(tasks.dueAt, new Date(input.query.to)));
    const rows = await database.select({ id: tasks.id, leadId: tasks.leadId, title: tasks.title, dueAt: tasks.dueAt, status: tasks.status, completedAt: tasks.completedAt, accountName: accounts.name, contactName: people.name }).from(tasks)
      .innerJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(...conditions)).orderBy(asc(tasks.dueAt)).limit(input.query.limit);
    return rows.map((row) => new TaskRecordDto(row.id, row.leadId, row.title, row.dueAt.toISOString(), row.status, row.completedAt?.toISOString() ?? null, row.accountName, row.contactName));
  }
  async createTask(input: TaskRepositoryCreateDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      if (!lead) return null;
      const [task] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: input.leadId, createdByUserId: input.createdByUserId, assignedToUserId: input.createdByUserId, title: input.title, dueAt: input.dueAt }).returning();
      await transaction.update(leads).set({ nextActionAt: sql`least(coalesce(${leads.nextActionAt}, ${input.dueAt}), ${input.dueAt})`, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)));
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), task.status, null, row.accountName, row.contactName);
    });
  }
  async completeTask(input: TaskRepositoryCompleteDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [task] = await transaction.update(tasks).set({ status: 'completed', completedAt: input.completedAt, updatedAt: input.completedAt }).where(and(eq(tasks.id, input.taskId), eq(tasks.organizationId, input.organizationId), eq(tasks.status, 'open'))).returning();
      if (!task) return null;
      const [next] = await transaction.select({ dueAt: min(tasks.dueAt) }).from(tasks).where(and(eq(tasks.organizationId, input.organizationId), eq(tasks.leadId, task.leadId), eq(tasks.status, 'open')));
      await transaction.update(leads).set({ nextActionAt: next.dueAt, updatedAt: input.completedAt }).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId)));
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), 'completed', input.completedAt.toISOString(), row.accountName, row.contactName);
    });
  }
  async list(input: LeadRepositoryListDto): Promise<LeadPageDto> {
    const conditions = [eq(leads.organizationId, input.organizationId)];
    if (input.query.status) conditions.push(eq(leads.status, input.query.status));
    if (input.query.source) conditions.push(eq(leads.source, input.query.source));
    const search = input.query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(ilike(accounts.name, pattern), ilike(people.name, pattern), ilike(people.email, pattern), ilike(people.phone, pattern));
      if (searchCondition) conditions.push(searchCondition);
    }
    const where = and(...conditions);
    const sortColumn = {
      accountName: accounts.name,
      contactName: people.name,
      channel: sql`coalesce(${people.email}, ${people.phone}, '')`,
      source: leads.source,
      status: leads.status,
      nextActionAt: leads.nextActionAt,
      createdAt: leads.createdAt,
    }[input.query.sortBy];
    const direction = input.query.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const base = database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(where);
    const [rows, totals] = await Promise.all([
      base.orderBy(direction, asc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return new LeadPageDto(rows.map(mapLead), { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }
  async create(input: LeadRepositoryCreateDto): Promise<LeadRecordDto> {
    return database.transaction(async (transaction) => {
      const [account] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: input.accountName }).returning();
      const [person] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.contactName, email: input.email, phone: input.phone }).returning();
      const [lead] = await transaction.insert(leads).values({ organizationId: input.organizationId, accountId: account.id, personId: person.id, createdByUserId: input.createdByUserId, source: input.source, status: 'new' }).returning();
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: lead.id, fromStatus: null, toStatus: 'new', changedByUserId: input.createdByUserId });
      return mapLead({ leadId: lead.id, accountName: account.name, contactName: person.name, email: person.email, phone: person.phone, source: lead.source, status: lead.status, nextActionAt: lead.nextActionAt, createdAt: lead.createdAt, updatedAt: lead.updatedAt });
    });
  }
  async findById(input: LeadRepositoryFindDto): Promise<LeadRecordDto | null> {
    const [row] = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
    return row ? mapLead(row) : null;
  }
  async updateStatus(input: LeadRepositoryStatusChangeDto): Promise<LeadRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [updated] = await transaction.update(leads).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, input.expectedStatus))).returning();
      if (!updated) return null;
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: input.expectedStatus, toStatus: input.status, changedByUserId: input.changedByUserId });
      const [row] = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
}
