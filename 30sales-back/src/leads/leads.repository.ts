import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, lt, min, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { database } from '../db';
import { accounts, auditEvents, leadStatusHistory, leads, people, tasks } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { LeadAssigneeDto, LeadDuplicateCandidateDto, LeadDuplicateCheckDto, LeadDuplicateCheckResponseDto, LeadPageDto, LeadRecordDto, LeadRepositoryAssignDto, LeadRepositoryCreateDto, LeadRepositoryDuplicateCheckDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto } from './leads.dto';

type DuplicateRow = { leadId: string; accountName: string; contactName: string; email: string | null; phone: string | null; status: LeadRecordDto['status']; source: string };
function duplicateMatch(input: LeadDuplicateCheckDto): SQL | undefined {
  const matches: SQL[] = []
  const accountName = input.accountName.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  matches.push(sql`lower(regexp_replace(trim(${accounts.name}), '[[:space:]]+', ' ', 'g')) = ${accountName}`)
  const email = input.email?.trim().toLocaleLowerCase()
  if (email) matches.push(sql`lower(trim(coalesce(${people.email}, ''))) = ${email}`)
  const phone = input.phone?.replace(/\D/g, '')
  if (phone && phone.length >= 7) matches.push(sql`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g') = ${phone}`)
  return or(...matches)
}
function duplicateLockKeys(organizationId: string, input: LeadDuplicateCheckDto): string[] {
  const keys = [`account:${input.accountName.trim().toLowerCase().replace(/\s+/g, ' ')}`]
  const email = input.email?.trim().toLowerCase()
  const phone = input.phone?.replace(/\D/g, '')
  if (email) keys.push(`email:${email}`)
  if (phone && phone.length >= 7) keys.push(`phone:${phone}`)
  return keys.map((key) => `${organizationId}:${key}`).sort()
}
function mapDuplicates(rows: DuplicateRow[], input: LeadDuplicateCheckDto): LeadDuplicateCheckResponseDto {
  const normalizedName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  const email = input.email?.trim().toLowerCase()
  const phone = input.phone?.replace(/\D/g, '')
  return new LeadDuplicateCheckResponseDto(rows.map((row) => {
    const matchedBy: LeadDuplicateCandidateDto['matchedBy'] = []
    if (normalizedName(row.accountName) === normalizedName(input.accountName)) matchedBy.push('account_name')
    if (email && row.email?.trim().toLowerCase() === email) matchedBy.push('email')
    if (phone && phone.length >= 7 && row.phone?.replace(/\D/g, '') === phone) matchedBy.push('phone')
    return new LeadDuplicateCandidateDto(row.leadId, row.accountName, row.contactName, row.status, row.source, matchedBy)
  }))
}

function mapLead(row: { leadId: string; accountName: string; contactName: string; email: string | null; phone: string | null; source: string; status: LeadRecordDto['status']; nextActionAt: Date | null; createdAt: Date; updatedAt: Date; assignedToUserId: string | null; assignedToName: string | null }): LeadRecordDto {
  return new LeadRecordDto(row.leadId, row.accountName, row.contactName, row.email, row.phone, row.source, row.status, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString(), row.assignedToUserId, row.assignedToName);
}
@Injectable()
export class LeadsRepository {
  async listAssignees(organizationId: string): Promise<LeadAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name, role: authMember.role }).from(authMember)
      .innerJoin(authUser, eq(authUser.id, authMember.userId)).where(eq(authMember.organizationId, organizationId)).orderBy(asc(authUser.name));
    return rows.map((row) => new LeadAssigneeDto(row.id, row.name, row.role));
  }
  async listTasks(input: TaskRepositoryListDto): Promise<TaskRecordDto[]> {
    const conditions = [eq(tasks.organizationId, input.organizationId), eq(tasks.status, input.query.status)];
    if (input.query.from) conditions.push(gte(tasks.dueAt, new Date(input.query.from)));
    if (input.query.to) conditions.push(lt(tasks.dueAt, new Date(input.query.to)));
    if (input.query.assignedToUserId) conditions.push(eq(tasks.assignedToUserId, input.query.assignedToUserId));
    const rows = await database.select({ id: tasks.id, leadId: tasks.leadId, title: tasks.title, dueAt: tasks.dueAt, status: tasks.status, completedAt: tasks.completedAt, completionResult: tasks.completionResult, completionNote: tasks.completionNote, accountName: accounts.name, contactName: people.name }).from(tasks)
      .innerJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(...conditions)).orderBy(asc(tasks.dueAt)).limit(input.query.limit);
    return rows.map((row) => new TaskRecordDto(row.id, row.leadId, row.title, row.dueAt.toISOString(), row.status, row.completedAt?.toISOString() ?? null, row.accountName, row.contactName, row.completionResult as TaskRecordDto['completionResult'], row.completionNote));
  }
  async findPossibleDuplicates(input: LeadRepositoryDuplicateCheckDto): Promise<LeadDuplicateCheckResponseDto> {
    const rows = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, status: leads.status, source: leads.source }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(eq(leads.organizationId, input.organizationId), duplicateMatch(input.input))).orderBy(desc(leads.updatedAt)).limit(10);
    return mapDuplicates(rows, input.input);
  }
  async createTask(input: TaskRepositoryCreateDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      if (!lead) return null;
      const [task] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: input.leadId, createdByUserId: input.createdByUserId, assignedToUserId: input.createdByUserId, title: input.title, dueAt: input.dueAt }).returning();
      await transaction.update(leads).set({ nextActionAt: sql`least(coalesce(${leads.nextActionAt}, ${input.dueAt}), ${input.dueAt})`, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.createdByUserId, actorType: 'user', action: 'task.created', entityType: 'task', entityId: task.id, correlationId: input.correlationId, afterState: { status: 'open', dueAt: input.dueAt.toISOString() } });
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), task.status, null, row.accountName, row.contactName, null, null);
    });
  }
  async completeTask(input: TaskRepositoryCompleteDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [task] = await transaction.update(tasks).set({ status: 'completed', completedAt: input.completedAt, completionResult: input.input.result, completionNote: input.input.resultNote ?? null, updatedAt: input.completedAt }).where(and(eq(tasks.id, input.taskId), eq(tasks.organizationId, input.organizationId), eq(tasks.status, 'open'))).returning();
      if (!task) return null;
      let followUpTaskId: string | null = null;
      if (input.input.followUp) {
        const [followUp] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: task.leadId, title: input.input.followUp.title, dueAt: new Date(input.input.followUp.dueAt), status: 'open', createdByUserId: input.actorUserId, assignedToUserId: task.assignedToUserId ?? input.actorUserId }).returning({ id: tasks.id });
        followUpTaskId = followUp.id;
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'user', actorUserId: input.actorUserId, action: 'task.created', entityType: 'task', entityId: followUp.id, correlationId: input.correlationId, afterState: { status: 'open', dueAt: input.input.followUp.dueAt, createdFromTaskId: task.id } });
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'user', actorUserId: input.actorUserId, action: 'task.completed', entityType: 'task', entityId: task.id, correlationId: input.correlationId, beforeState: { status: 'open' }, afterState: { status: 'completed', completionResult: input.input.result, completionNote: input.input.resultNote ?? null, followUpTaskId } });
      const [next] = await transaction.select({ dueAt: min(tasks.dueAt) }).from(tasks).where(and(eq(tasks.organizationId, input.organizationId), eq(tasks.leadId, task.leadId), eq(tasks.status, 'open')));
      await transaction.update(leads).set({ nextActionAt: next?.dueAt ?? null, updatedAt: input.completedAt }).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId)));
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), 'completed', input.completedAt.toISOString(), row.accountName, row.contactName, task.completionResult as TaskRecordDto['completionResult'], task.completionNote);
    });
  }
  async list(input: LeadRepositoryListDto): Promise<LeadPageDto> {
    const conditions = [eq(leads.organizationId, input.organizationId)];
    if (input.query.status) conditions.push(eq(leads.status, input.query.status));
    if (input.query.source) conditions.push(eq(leads.source, input.query.source));
    if (input.query.assignedToUserId === 'unassigned') conditions.push(sql`${leads.assignedToUserId} is null`);
    else if (input.query.assignedToUserId) conditions.push(eq(leads.assignedToUserId, input.query.assignedToUserId));
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
      assignedTo: authUser.name,
      nextActionAt: leads.nextActionAt,
      createdAt: leads.createdAt,
    }[input.query.sortBy];
    const direction = input.query.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const base = database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId)).where(where);
    const [rows, totals] = await Promise.all([
      base.orderBy(direction, asc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return new LeadPageDto(rows.map(mapLead), { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }
  async create(input: LeadRepositoryCreateDto): Promise<LeadRecordDto | LeadDuplicateCheckResponseDto> {
    return database.transaction(async (transaction) => {
      const duplicateInput: LeadDuplicateCheckDto = { accountName: input.accountName, email: input.email ?? undefined, phone: input.phone ?? undefined };
      for (const lockKey of duplicateLockKeys(input.organizationId, duplicateInput)) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}), 0)`);
      }
      const duplicateRows = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, status: leads.status, source: leads.source }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), duplicateMatch(duplicateInput))).orderBy(desc(leads.updatedAt)).limit(10);
      const duplicates = mapDuplicates(duplicateRows, duplicateInput);
      if (duplicates.candidates.length && !input.duplicateOverrideReason) return duplicates;
      const [account] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: input.accountName }).returning();
      const [person] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.contactName, email: input.email, phone: input.phone }).returning();
      const [lead] = await transaction.insert(leads).values({ organizationId: input.organizationId, accountId: account.id, personId: person.id, createdByUserId: input.createdByUserId, assignedToUserId: input.createdByUserId, source: input.source, status: 'new' }).returning();
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: lead.id, fromStatus: null, toStatus: 'new', changedByUserId: input.createdByUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.createdByUserId, actorType: 'user', action: 'lead.created', entityType: 'lead', entityId: lead.id, correlationId: input.correlationId, reason: input.duplicateOverrideReason ?? null, afterState: { status: 'new', source: input.source, assignedToUserId: input.createdByUserId, duplicateOverride: Boolean(input.duplicateOverrideReason), possibleDuplicateIds: duplicates.candidates.map((candidate) => candidate.id) } });
      const [assignedTo] = await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, lead.assignedToUserId!)).limit(1);
      return mapLead({ leadId: lead.id, accountName: account.name, contactName: person.name, email: person.email, phone: person.phone, source: lead.source, status: lead.status, nextActionAt: lead.nextActionAt, createdAt: lead.createdAt, updatedAt: lead.updatedAt, assignedToUserId: lead.assignedToUserId, assignedToName: assignedTo.name });
    });
  }
  async findById(input: LeadRepositoryFindDto): Promise<LeadRecordDto | null> {
    const [row] = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
    return row ? mapLead(row) : null;
  }
  async updateStatus(input: LeadRepositoryStatusChangeDto): Promise<LeadRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [updated] = await transaction.update(leads).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, input.expectedStatus))).returning();
      if (!updated) return null;
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: input.expectedStatus, toStatus: input.status, changedByUserId: input.changedByUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.changedByUserId, actorType: 'user', action: 'lead.status_changed', entityType: 'lead', entityId: input.leadId, correlationId: input.correlationId, reason: input.reason, beforeState: { status: input.expectedStatus }, afterState: { status: input.status } });
      const [row] = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
  async assign(input: LeadRepositoryAssignDto): Promise<LeadRecordDto | 'invalid_assignee' | null> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ assignedToUserId: leads.assignedToUserId }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      if (!current) return null;
      if (input.assignedToUserId) {
        const [membership] = await transaction.select({ id: authMember.id }).from(authMember).where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.assignedToUserId))).limit(1);
        if (!membership) return 'invalid_assignee';
      }
      const [updated] = await transaction.update(leads).set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.assigned', entityType: 'lead', entityId: input.leadId, correlationId: input.correlationId, beforeState: { assignedToUserId: current.assignedToUserId }, afterState: { assignedToUserId: input.assignedToUserId } });
      const [row] = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
        .where(and(eq(leads.id, updated.id), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
}
