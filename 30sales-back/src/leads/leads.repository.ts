import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, isNull, lt, lte, min, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { database } from '../db';
import { accountSegments, accounts, agentSettings, auditEvents, conversations, leadContacts, leadStatusHistory, leads, messagingChannels, opportunities, people, tasks, userNotifications } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { LeadAssigneeDto, LeadContactCreateRepositoryDto, LeadContactOutreachReviewRepositoryDto, LeadContactPrimaryRepositoryDto, LeadContactRecordDto, LeadContactRepositoryDto, LeadContactUpdateRepositoryDto, LeadDuplicateCandidateDto, LeadDuplicateCheckDto, LeadDuplicateCheckResponseDto, LeadPageDto, LeadRecordDto, LeadRepositoryAccessDto, LeadRepositoryAssignDto, LeadRepositoryCreateDto, LeadRepositoryDuplicateCheckDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto, SdrPreviewChannelDto, SdrPreviewDto, SdrPreviewLeadDto, SdrPreviewRepositoryInputDto, SdrReadinessDto, SdrReadinessRepositoryInputDto, TaskPageDto, TaskRecordDto, TaskRepositoryCompleteDto, TaskRepositoryCreateDto, TaskRepositoryListDto, taskCompletionResultSchema } from './leads.dto';
import { CONTACT_OUTREACH_AUDIT_ACTION, CONTACT_OUTREACH_DECISION, LEAD_STATUS, SDR_ACTIVE_CONVERSATION_STATUSES, SDR_AGENT_KEY, SDR_READINESS_BLOCKER, SDR_READINESS_BLOCKERS, UNASSIGNED_SEGMENT_FILTER } from './constants';

type DuplicateRow = { leadId: string; accountName: string; contactName: string | null; email: string | null; phone: string | null; status: LeadRecordDto['status']; source: string };
function parseTaskCompletionResult(value: string | null) {
  return value === null ? null : taskCompletionResultSchema.parse(value);
}
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

function mapLead(row: { leadId: string; accountId: string; accountName: string; accountSegmentId: string | null; accountSegmentName: string | null; accountMarketSegment: LeadRecordDto['accountMarketSegment']; accountStudentCount: number | null; contactName: string | null; email: string | null; phone: string | null; source: string; status: LeadRecordDto['status']; nextActionAt: Date | null; createdAt: Date; updatedAt: Date; assignedToUserId: string | null; assignedToName: string | null }): LeadRecordDto {
  return new LeadRecordDto(row.leadId, row.accountId, row.accountName, row.accountSegmentId, row.accountSegmentName, row.accountMarketSegment, row.accountStudentCount, row.contactName, row.email, row.phone, row.source, row.status, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString(), row.assignedToUserId, row.assignedToName);
}
function leadAccessCondition(access: LeadRepositoryAccessDto): SQL | undefined {
  if (access.canManageAll) return undefined;
  const assignedToUser = eq(leads.assignedToUserId, access.userId);
  if (!access.includeOwnedOpportunities) return assignedToUser;
  return or(assignedToUser, exists(database.select({ id: opportunities.id }).from(opportunities)
    .where(and(eq(opportunities.organizationId, access.organizationId), eq(opportunities.leadId, leads.id), eq(opportunities.ownerUserId, access.userId)))));
}
function contactLeadAccessCondition(access: LeadRepositoryAccessDto): SQL {
  return exists(database.select({ id: leads.id }).from(leads).where(and(
    eq(leads.id, leadContacts.leadId), eq(leads.organizationId, access.organizationId), leadAccessCondition(access),
  )));
}
@Injectable()
export class LeadsRepository {
  async listSdrPreviewChannels(organizationId: string): Promise<SdrPreviewChannelDto[]> {
    const rows = await database.select({ id: messagingChannels.id, displayName: messagingChannels.displayName, phoneNumber: messagingChannels.phoneNumber, isActive: messagingChannels.isActive, isConfigured: sql<boolean>`${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null` }).from(messagingChannels)
      .where(eq(messagingChannels.organizationId, organizationId)).orderBy(asc(messagingChannels.displayName), asc(messagingChannels.id));
    return rows.map((channel) => new SdrPreviewChannelDto(channel.id, channel.displayName, channel.phoneNumber, channel.isActive, channel.isConfigured));
  }

  async getSdrPreview(input: SdrPreviewRepositoryInputDto): Promise<SdrPreviewDto> {
    const conditions = [eq(leads.organizationId, input.organizationId), eq(leads.status, LEAD_STATUS.ready)];
    const accessCondition = leadAccessCondition(input.access);
    if (accessCondition) conditions.push(accessCondition);
    const [rows, [countRow], [channel], [agent]] = await Promise.all([
      database.select({ leadId: leads.id, accountName: accounts.name, source: leads.source, contactName: people.name, phone: people.phone, contactId: leadContacts.id, outreachDecision: leadContacts.outreachDecision,
        hasConversation: exists(database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES)))),
      }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
        .where(and(...conditions)).orderBy(desc(leads.createdAt), asc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).where(and(...conditions)),
      database.select({ id: messagingChannels.id }).from(messagingChannels).where(and(eq(messagingChannels.organizationId, input.organizationId), input.query.channelId ? eq(messagingChannels.id, input.query.channelId) : sql`false`, eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`)).limit(1),
      database.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) > 0` }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1),
    ]);
    const leadsWithBlockers = rows.map((lead) => {
      const blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]> = [];
      if (!lead.contactId) blockers.push(SDR_READINESS_BLOCKER.primaryContactMissing);
      const digits = lead.phone?.replace(/\D/g, '') ?? '';
      if (digits.length < 8 || digits.length > 15) blockers.push(SDR_READINESS_BLOCKER.phoneMissing);
      if (!channel) blockers.push(SDR_READINESS_BLOCKER.activeChannelMissing);
      if (!agent?.enabled || !agent.hasPrompt) blockers.push(SDR_READINESS_BLOCKER.assistantDisabled);
      if (lead.hasConversation) blockers.push(SDR_READINESS_BLOCKER.existingConversation);
      if (lead.outreachDecision === CONTACT_OUTREACH_DECISION.pending) blockers.push(SDR_READINESS_BLOCKER.contactPermissionUnverified);
      else if (lead.outreachDecision === CONTACT_OUTREACH_DECISION.blocked) blockers.push(SDR_READINESS_BLOCKER.contactOutreachBlocked);
      return new SdrPreviewLeadDto(lead.leadId, lead.accountName, lead.contactName, lead.source, blockers);
    });
    const total = countRow?.total ?? 0;
    const withoutBlockers = leadsWithBlockers.filter((lead) => lead.blockers.length === 0).length;
    return new SdrPreviewDto(leadsWithBlockers, { withoutBlockers, blocked: leadsWithBlockers.length - withoutBlockers }, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }

  async getSdrReadiness(input: SdrReadinessRepositoryInputDto): Promise<SdrReadinessDto | null> {
    const [lead] = await database.select({ id: leads.id, status: leads.status, phone: people.phone, primaryContactId: leadContacts.id, outreachDecision: leadContacts.outreachDecision,
      hasConversation: exists(database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES)))),
    }).from(leads)
      .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
      .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).limit(1);
    if (!lead) return null;
    const [channel] = await database.select({ id: messagingChannels.id, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag }).from(messagingChannels)
      .where(and(eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.isActive, true))).limit(1);
    const [agent] = await database.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) > 0` }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1);
    const blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]> = [];
    if (!lead.primaryContactId) blockers.push(SDR_READINESS_BLOCKER.primaryContactMissing);
    const phoneDigits = lead.phone?.replace(/\D/g, '') ?? '';
    if (phoneDigits.length < 8 || phoneDigits.length > 15) blockers.push(SDR_READINESS_BLOCKER.phoneMissing);
    if (!channel?.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) blockers.push(SDR_READINESS_BLOCKER.activeChannelMissing);
    if (!agent?.enabled || !agent.hasPrompt) blockers.push(SDR_READINESS_BLOCKER.assistantDisabled);
    if (lead.status === LEAD_STATUS.doNotContact) blockers.push(SDR_READINESS_BLOCKER.doNotContact);
    else if (lead.status !== LEAD_STATUS.ready) blockers.push(SDR_READINESS_BLOCKER.leadNotReady);
    if (lead.hasConversation) blockers.push(SDR_READINESS_BLOCKER.existingConversation);
    if (lead.outreachDecision === CONTACT_OUTREACH_DECISION.pending) blockers.push(SDR_READINESS_BLOCKER.contactPermissionUnverified);
    else if (lead.outreachDecision === CONTACT_OUTREACH_DECISION.blocked) blockers.push(SDR_READINESS_BLOCKER.contactOutreachBlocked);
    return new SdrReadinessDto(lead.id, blockers);
  }
  async listAssignees(organizationId: string): Promise<LeadAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name, role: authMember.role }).from(authMember)
      .innerJoin(authUser, eq(authUser.id, authMember.userId)).where(eq(authMember.organizationId, organizationId)).orderBy(asc(authUser.name));
    return rows.map((row) => new LeadAssigneeDto(row.id, row.name, row.role));
  }
  async listTasks(input: TaskRepositoryListDto): Promise<TaskRecordDto[]> {
    return this.findTaskRows(input);
  }

  async listTasksPage(input: TaskRepositoryListDto): Promise<TaskPageDto> {
    const conditions = this.taskConditions(input);
    const [data, [result]] = await Promise.all([
      this.findTaskRows(input),
      database.select({ total: count() }).from(tasks)
        .innerJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(...conditions)),
    ]);
    const total = result?.total ?? 0;
    return new TaskPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  private taskConditions(input: TaskRepositoryListDto): SQL[] {
    const conditions: SQL[] = [eq(tasks.organizationId, input.organizationId)];
    if (input.query.taskId) conditions.push(eq(tasks.id, input.query.taskId));
    if (!input.canManageAll) conditions.push(eq(tasks.assignedToUserId, input.userId));
    if (input.query.status) conditions.push(eq(tasks.status, input.query.status));
    else if (!input.query.taskId) conditions.push(eq(tasks.status, 'open'));
    if (input.query.from) conditions.push(gte(tasks.dueAt, new Date(input.query.from)));
    if (input.query.to) conditions.push(lt(tasks.dueAt, new Date(input.query.to)));
    if (input.query.assignedToUserId) conditions.push(eq(tasks.assignedToUserId, input.query.assignedToUserId));
    if (input.query.search) {
      const pattern = `%${input.query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(tasks.title, pattern), ilike(accounts.name, pattern), ilike(people.name, pattern))!);
    }
    return conditions;
  }

  private async findTaskRows(input: TaskRepositoryListDto): Promise<TaskRecordDto[]> {
    const sortColumn = input.query.sortBy === 'title' ? tasks.title : input.query.sortBy === 'accountName' ? accounts.name : input.query.sortBy === 'contactName' ? people.name : tasks.dueAt;
    const primaryOrder = input.query.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const tieOrder = input.query.sortDirection === 'asc' ? asc(tasks.id) : desc(tasks.id);
    const rows = await database.select({ id: tasks.id, leadId: tasks.leadId, title: tasks.title, dueAt: tasks.dueAt, status: tasks.status, completedAt: tasks.completedAt, completionResult: tasks.completionResult, completionNote: tasks.completionNote, accountName: accounts.name, contactName: people.name }).from(tasks)
      .innerJoin(leads, and(eq(leads.id, tasks.leadId), eq(leads.organizationId, tasks.organizationId)))
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(...this.taskConditions(input))).orderBy(primaryOrder, tieOrder).limit(input.query.limit).offset(input.query.offset);
    return rows.map((row) => new TaskRecordDto(row.id, row.leadId, row.title, row.dueAt.toISOString(), row.status, row.completedAt?.toISOString() ?? null, row.accountName, row.contactName, parseTaskCompletionResult(row.completionResult), row.completionNote));
  }
  async findPossibleDuplicates(input: LeadRepositoryDuplicateCheckDto): Promise<LeadDuplicateCheckResponseDto> {
    const rows = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, status: leads.status, source: leads.source }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access), duplicateMatch(input.input))).orderBy(desc(leads.updatedAt)).limit(10);
    return mapDuplicates(rows, input.input);
  }
  async createTask(input: TaskRepositoryCreateDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).for('update').limit(1);
      if (!lead) return null;
      const [task] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: input.leadId, createdByUserId: input.createdByUserId, assignedToUserId: input.createdByUserId, title: input.title, dueAt: input.dueAt }).returning();
      await transaction.update(leads).set({ nextActionAt: sql`least(coalesce(${leads.nextActionAt}, ${input.dueAt}), ${input.dueAt})`, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.createdByUserId, actorType: 'user', action: 'task.created', entityType: 'task', entityId: task.id, correlationId: input.correlationId, afterState: { status: 'open', dueAt: input.dueAt.toISOString() } });
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), task.status, null, row.accountName, row.contactName, null, null);
    });
  }
  async completeTask(input: TaskRepositoryCompleteDto): Promise<TaskRecordDto | null> {
    return database.transaction(async (transaction) => {
      const taskConditions = [eq(tasks.id, input.taskId), eq(tasks.organizationId, input.organizationId), eq(tasks.status, 'open')];
      if (!input.canManageAll) taskConditions.push(eq(tasks.assignedToUserId, input.actorUserId));
      const [task] = await transaction.update(tasks).set({ status: 'completed', completedAt: input.completedAt, completionResult: input.input.result, completionNote: input.input.resultNote ?? null, updatedAt: input.completedAt }).where(and(...taskConditions)).returning();
      if (!task) return null;
      await transaction.update(userNotifications).set({ readAt: input.completedAt }).where(and(eq(userNotifications.organizationId, input.organizationId), eq(userNotifications.taskId, task.id), isNull(userNotifications.readAt)));
      let followUpTaskId: string | null = null;
      if (input.input.followUp) {
        const [followUp] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: task.leadId, title: input.input.followUp.title, dueAt: new Date(input.input.followUp.dueAt), status: 'open', createdByUserId: input.actorUserId, assignedToUserId: task.assignedToUserId ?? input.actorUserId }).returning({ id: tasks.id });
        followUpTaskId = followUp.id;
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'user', actorUserId: input.actorUserId, action: 'task.created', entityType: 'task', entityId: followUp.id, correlationId: input.correlationId, afterState: { status: 'open', dueAt: input.input.followUp.dueAt, createdFromTaskId: task.id } });
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: 'user', actorUserId: input.actorUserId, action: 'task.completed', entityType: 'task', entityId: task.id, correlationId: input.correlationId, beforeState: { status: 'open' }, afterState: { status: 'completed', completionResult: input.input.result, completionNote: input.input.resultNote ?? null, followUpTaskId } });
      const [next] = await transaction.select({ dueAt: min(tasks.dueAt) }).from(tasks).where(and(eq(tasks.organizationId, input.organizationId), eq(tasks.leadId, task.leadId), eq(tasks.status, 'open')));
      await transaction.update(leads).set({ nextActionAt: next?.dueAt ?? null, updatedAt: input.completedAt }).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId)));
      const [row] = await transaction.select({ accountName: accounts.name, contactName: people.name }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(and(eq(leads.id, task.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return new TaskRecordDto(task.id, task.leadId, task.title, task.dueAt.toISOString(), 'completed', input.completedAt.toISOString(), row.accountName, row.contactName, parseTaskCompletionResult(task.completionResult), task.completionNote);
    });
  }
  async list(input: LeadRepositoryListDto): Promise<LeadPageDto> {
    const conditions: SQL[] = [eq(leads.organizationId, input.organizationId)];
    const accessCondition = leadAccessCondition(input.access);
    if (accessCondition) conditions.push(accessCondition);
    if (input.query.status) conditions.push(eq(leads.status, input.query.status));
    if (input.query.source) conditions.push(eq(leads.source, input.query.source));
    if (input.query.segmentId === UNASSIGNED_SEGMENT_FILTER) conditions.push(isNull(accounts.segmentId));
    else if (input.query.segmentId) conditions.push(eq(accounts.segmentId, input.query.segmentId));
    if (input.query.marketSegment) conditions.push(eq(accounts.marketSegment, input.query.marketSegment));
    if (input.query.withoutMarketSegment) conditions.push(isNull(accounts.marketSegment));
    if (input.query.studentCountMin !== undefined) conditions.push(gte(accounts.studentCount, input.query.studentCountMin));
    if (input.query.studentCountMax !== undefined) conditions.push(lte(accounts.studentCount, input.query.studentCountMax));
    if (input.query.assignedToUserId === 'unassigned') conditions.push(sql`${leads.assignedToUserId} is null`);
    else if (input.query.assignedToUserId) conditions.push(eq(leads.assignedToUserId, input.query.assignedToUserId));
    const search = input.query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(ilike(accounts.name, pattern), ilike(people.name, pattern), ilike(people.email, pattern), ilike(people.phone, pattern), exists(database.select({ id: leadContacts.id }).from(leadContacts)
        .innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leads.id), or(ilike(people.name, pattern), ilike(people.email, pattern), ilike(people.phone, pattern))!))));
      if (searchCondition) conditions.push(searchCondition);
    }
    const where = and(...conditions);
    const sortColumn = {
      accountName: accounts.name,
      contactName: people.name,
      channel: sql`coalesce(${people.email}, ${people.phone}, '')`,
      source: leads.source,
      status: leads.status,
      segment: accountSegments.name,
      assignedTo: authUser.name,
      nextActionAt: leads.nextActionAt,
      createdAt: leads.createdAt,
    }[input.query.sortBy];
    const direction = input.query.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const base = database.select({ leadId: leads.id, accountId: accounts.id, accountName: accounts.name, accountSegmentId: accounts.segmentId, accountSegmentName: accountSegments.name, accountMarketSegment: accounts.marketSegment, accountStudentCount: accounts.studentCount, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId)).where(where);
    const [rows, totals] = await Promise.all([
      base.orderBy(direction, asc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId))).leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId))).leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId))).where(where),
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
      const [duplicate] = await transaction.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.organizationId, input.organizationId), duplicateMatch(duplicateInput))).limit(1);
      const duplicateRows = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, status: leads.status, source: leads.source }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access), duplicateMatch(duplicateInput))).orderBy(desc(leads.updatedAt)).limit(10);
      const duplicates = mapDuplicates(duplicateRows, duplicateInput);
      if (duplicate && !input.duplicateOverrideReason) return duplicates;
      const [account] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: input.accountName }).returning();
      const [person] = input.contactName ? await transaction.insert(people).values({ organizationId: input.organizationId, name: input.contactName, email: input.email, phone: input.phone }).returning() : [null];
      const [lead] = await transaction.insert(leads).values({ organizationId: input.organizationId, accountId: account.id, personId: person?.id ?? null, createdByUserId: input.createdByUserId, assignedToUserId: input.createdByUserId, source: input.source, status: 'new' }).returning();
      if (person) await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: lead.id, personId: person.id, isPrimary: true, createdByUserId: input.createdByUserId });
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: lead.id, fromStatus: null, toStatus: 'new', changedByUserId: input.createdByUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.createdByUserId, actorType: 'user', action: 'lead.created', entityType: 'lead', entityId: lead.id, correlationId: input.correlationId, reason: input.duplicateOverrideReason ?? null, afterState: { status: 'new', source: input.source, assignedToUserId: input.createdByUserId, duplicateOverride: Boolean(input.duplicateOverrideReason), possibleDuplicateIds: duplicates.candidates.map((candidate) => candidate.id) } });
      const [assignedTo] = await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, lead.assignedToUserId!)).limit(1);
      return mapLead({ leadId: lead.id, accountId: account.id, accountName: account.name, accountSegmentId: null, accountSegmentName: null, accountMarketSegment: null, accountStudentCount: null, contactName: person?.name ?? null, email: person?.email ?? null, phone: person?.phone ?? null, source: lead.source, status: lead.status, nextActionAt: lead.nextActionAt, createdAt: lead.createdAt, updatedAt: lead.updatedAt, assignedToUserId: lead.assignedToUserId, assignedToName: assignedTo.name });
    });
  }
  async findById(input: LeadRepositoryFindDto): Promise<LeadRecordDto | null> {
    const [row] = await database.select({ leadId: leads.id, accountId: accounts.id, accountName: accounts.name, accountSegmentId: accounts.segmentId, accountSegmentName: accountSegments.name, accountMarketSegment: accounts.marketSegment, accountStudentCount: accounts.studentCount, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId)))
      .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).limit(1);
    return row ? mapLead(row) : null;
  }
  async listContacts(input: LeadContactRepositoryDto): Promise<LeadContactRecordDto[] | null> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ personId: leads.personId }).from(leads)
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).for('update').limit(1);
      if (!lead) return null;
      if (lead.personId) {
        await transaction.update(leadContacts).set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.isPrimary, true), sql`${leadContacts.personId} <> ${lead.personId}`));
        await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: input.leadId, personId: lead.personId, isPrimary: true, createdByUserId: input.actorUserId })
          .onConflictDoNothing({ target: [leadContacts.leadId, leadContacts.personId] });
        await transaction.update(leadContacts).set({ isPrimary: true, updatedAt: new Date() })
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.personId, lead.personId)));
      }
      const rows = await transaction.select({ id: leadContacts.id, name: people.name, email: people.email, phone: people.phone, jobTitle: leadContacts.jobTitle, isPrimary: leadContacts.isPrimary, isInterested: leadContacts.isInterested, referralNote: leadContacts.referralNote, notes: leadContacts.notes, personId: leadContacts.personId, outreachDecision: leadContacts.outreachDecision, outreachBasis: leadContacts.outreachBasis, outreachEvidence: leadContacts.outreachEvidence, outreachReviewedAt: leadContacts.outreachReviewedAt, outreachReviewedByName: authUser.name })
        .from(leadContacts).innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leadContacts.outreachReviewedByUserId))
        .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, input.leadId))).orderBy(desc(leadContacts.isPrimary), asc(people.name));
      const personIds = rows.map((row) => row.personId);
      const activeConversationRows = personIds.length ? await transaction.select({ personId: conversations.personId }).from(conversations)
        .where(and(eq(conversations.organizationId, input.organizationId), inArray(conversations.personId, personIds), inArray(conversations.status, ['open', 'pending', 'snoozed']))) : [];
      const peopleInConversation = new Set(activeConversationRows.map((row) => row.personId));
      return rows.map((row) => new LeadContactRecordDto(row.id, row.name, row.email, row.phone, row.jobTitle, row.isPrimary, row.isInterested, peopleInConversation.has(row.personId), row.referralNote, row.notes, row.outreachDecision, row.outreachBasis, row.outreachEvidence, row.outreachReviewedAt?.toISOString() ?? null, row.outreachReviewedByName));
    });
  }
  async createContact(input: LeadContactCreateRepositoryDto): Promise<LeadContactRecordDto | 'lead_not_found' | 'duplicate_contact'> {
    return database.transaction(async (transaction) => {
      const [lead] = await transaction.select({ personId: leads.personId }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).for('update').limit(1);
      if (!lead) return 'lead_not_found';
      const email = input.input.email?.trim().toLowerCase();
      const phone = input.input.phone?.replace(/\D/g, '');
      const normalizedName = input.input.name.trim().toLocaleLowerCase('en-US');
      const contactMatch = or(
        ...(email ? [sql`lower(trim(coalesce(${people.email}, ''))) = ${email}`] : []),
        ...(phone && phone.length >= 7 ? [sql`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g') = ${phone} and lower(trim(${people.name})) = ${normalizedName}`] : []),
      );
      const existing = contactMatch ? await transaction.select({ id: leadContacts.id }).from(leadContacts).innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, input.leadId), contactMatch)).limit(1) : [];
      if (existing.length) return 'duplicate_contact';
      const [person] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.input.name, email: email || null, phone: input.input.phone?.trim() || null }).returning();
      const [contact] = await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: input.leadId, personId: person.id, jobTitle: input.input.jobTitle?.trim() || null, isInterested: input.input.isInterested, referralNote: input.input.referralNote?.trim() || null, notes: input.input.notes?.trim() || null, createdByUserId: input.actorUserId }).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.contact_added', entityType: 'lead_contact', entityId: contact.id, correlationId: input.correlationId, afterState: { leadId: input.leadId, personId: person.id, hasEmail: Boolean(email), hasPhone: Boolean(phone), hasRoleLabel: Boolean(input.input.jobTitle), isInterested: input.input.isInterested } });
      return new LeadContactRecordDto(contact.id, person.name, person.email, person.phone, contact.jobTitle, false, contact.isInterested, false, contact.referralNote, contact.notes);
    });
  }
  async updateContact(input: LeadContactUpdateRepositoryDto): Promise<LeadContactRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ isInterested: leadContacts.isInterested, personId: leadContacts.personId, name: people.name, email: people.email, phone: people.phone, jobTitle: leadContacts.jobTitle, isPrimary: leadContacts.isPrimary, referralNote: leadContacts.referralNote, notes: leadContacts.notes, outreachDecision: leadContacts.outreachDecision, outreachBasis: leadContacts.outreachBasis, outreachEvidence: leadContacts.outreachEvidence, outreachReviewedAt: leadContacts.outreachReviewedAt, outreachReviewedByName: authUser.name }).from(leadContacts)
        .innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leadContacts.outreachReviewedByUserId))
        .where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access))).limit(1);
      if (!current) return null;
      await transaction.update(leadContacts).set({ isInterested: input.input.isInterested, updatedAt: new Date() }).where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access)));
      if (current.isInterested !== input.input.isInterested) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.contact_interest_changed', entityType: 'lead_contact', entityId: input.contactId, correlationId: input.correlationId, beforeState: { isInterested: current.isInterested }, afterState: { isInterested: input.input.isInterested } });
      return new LeadContactRecordDto(input.contactId, current.name, current.email, current.phone, current.jobTitle, current.isPrimary, input.input.isInterested, false, current.referralNote, current.notes, current.outreachDecision, current.outreachBasis, current.outreachEvidence, current.outreachReviewedAt?.toISOString() ?? null, current.outreachReviewedByName);
    });
  }
  async reviewContactOutreach(input: LeadContactOutreachReviewRepositoryDto): Promise<LeadContactRecordDto | null> {
    const reviewedAt = input.input.decision === CONTACT_OUTREACH_DECISION.pending ? null : new Date();
    const updated = await database.transaction(async (transaction) => {
      const [current] = await transaction.select({ outreachDecision: leadContacts.outreachDecision, outreachBasis: leadContacts.outreachBasis, outreachEvidence: leadContacts.outreachEvidence })
        .from(leadContacts).where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access))).for('update').limit(1);
      if (!current) return false;
      const nextBasis = input.input.decision === CONTACT_OUTREACH_DECISION.pending ? null : input.input.basis ?? null;
      const nextEvidence = input.input.decision === CONTACT_OUTREACH_DECISION.pending ? null : input.input.evidence ?? null;
      if (current.outreachDecision === input.input.decision && current.outreachBasis === nextBasis && current.outreachEvidence === nextEvidence) return true;
      await transaction.update(leadContacts).set({ outreachDecision: input.input.decision, outreachBasis: nextBasis, outreachEvidence: nextEvidence, outreachReviewedByUserId: reviewedAt ? input.actorUserId : null, outreachReviewedAt: reviewedAt, updatedAt: new Date() })
        .where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: CONTACT_OUTREACH_AUDIT_ACTION, entityType: 'lead_contact', entityId: input.contactId, correlationId: input.correlationId, beforeState: { decision: current.outreachDecision, basis: current.outreachBasis }, afterState: { decision: input.input.decision, basis: input.input.basis ?? null } });
      return true;
    });
    if (!updated) return null;
    const [contact] = await database.select({ id: leadContacts.id, name: people.name, email: people.email, phone: people.phone, jobTitle: leadContacts.jobTitle, isPrimary: leadContacts.isPrimary, isInterested: leadContacts.isInterested, referralNote: leadContacts.referralNote, notes: leadContacts.notes, personId: leadContacts.personId, outreachDecision: leadContacts.outreachDecision, outreachBasis: leadContacts.outreachBasis, outreachEvidence: leadContacts.outreachEvidence, outreachReviewedAt: leadContacts.outreachReviewedAt, outreachReviewedByName: authUser.name })
      .from(leadContacts).innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId))).leftJoin(authUser, eq(authUser.id, leadContacts.outreachReviewedByUserId))
      .where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access))).limit(1);
    if (!contact) return null;
    const [active] = await database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, contact.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))).limit(1);
    return new LeadContactRecordDto(contact.id, contact.name, contact.email, contact.phone, contact.jobTitle, contact.isPrimary, contact.isInterested, Boolean(active), contact.referralNote, contact.notes, contact.outreachDecision, contact.outreachBasis, contact.outreachEvidence, contact.outreachReviewedAt?.toISOString() ?? null, contact.outreachReviewedByName);
  }
  async setPrimaryContact(input: LeadContactPrimaryRepositoryDto): Promise<LeadContactRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [contact] = await transaction.select({ personId: leadContacts.personId, isPrimary: leadContacts.isPrimary, name: people.name, email: people.email, phone: people.phone, jobTitle: leadContacts.jobTitle, isInterested: leadContacts.isInterested, referralNote: leadContacts.referralNote, notes: leadContacts.notes, outreachDecision: leadContacts.outreachDecision, outreachBasis: leadContacts.outreachBasis, outreachEvidence: leadContacts.outreachEvidence, outreachReviewedAt: leadContacts.outreachReviewedAt, outreachReviewedByName: authUser.name }).from(leadContacts)
        .innerJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leadContacts.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leadContacts.outreachReviewedByUserId))
        .where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access))).limit(1);
      if (!contact) return null;
      const [lead] = await transaction.select({ personId: leads.personId }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).for('update').limit(1);
      if (!lead) return null;
      if (!contact.isPrimary) {
        await transaction.update(leadContacts).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, input.leadId), eq(leadContacts.isPrimary, true), contactLeadAccessCondition(input.access)));
        await transaction.update(leadContacts).set({ isPrimary: true, updatedAt: new Date() }).where(and(eq(leadContacts.id, input.contactId), eq(leadContacts.organizationId, input.organizationId), contactLeadAccessCondition(input.access)));
        await transaction.update(leads).set({ personId: contact.personId, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access)));
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.primary_contact_changed', entityType: 'lead', entityId: input.leadId, correlationId: input.correlationId, beforeState: { personId: lead.personId }, afterState: { personId: contact.personId } });
      }
      const active = await transaction.select({ personId: conversations.personId }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, contact.personId), inArray(conversations.status, ['open', 'pending', 'snoozed']))).limit(1);
      return new LeadContactRecordDto(input.contactId, contact.name, contact.email, contact.phone, contact.jobTitle, true, contact.isInterested, active.length > 0, contact.referralNote, contact.notes, contact.outreachDecision, contact.outreachBasis, contact.outreachEvidence, contact.outreachReviewedAt?.toISOString() ?? null, contact.outreachReviewedByName);
    });
  }
  async updateStatus(input: LeadRepositoryStatusChangeDto): Promise<LeadRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [updated] = await transaction.update(leads).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, input.expectedStatus), leadAccessCondition(input.access))).returning();
      if (!updated) return null;
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: input.expectedStatus, toStatus: input.status, changedByUserId: input.changedByUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.changedByUserId, actorType: 'user', action: 'lead.status_changed', entityType: 'lead', entityId: input.leadId, correlationId: input.correlationId, reason: input.reason, beforeState: { status: input.expectedStatus }, afterState: { status: input.status } });
      const [row] = await transaction.select({ leadId: leads.id, accountId: accounts.id, accountName: accounts.name, accountSegmentId: accounts.segmentId, accountSegmentName: accountSegments.name, accountMarketSegment: accounts.marketSegment, accountStudentCount: accounts.studentCount, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId)))
        .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
  async assign(input: LeadRepositoryAssignDto): Promise<LeadRecordDto | 'invalid_assignee' | null> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ assignedToUserId: leads.assignedToUserId }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).limit(1);
      if (!current) return null;
      if (input.assignedToUserId) {
        const [membership] = await transaction.select({ id: authMember.id }).from(authMember).where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.assignedToUserId))).limit(1);
        if (!membership) return 'invalid_assignee';
      }
      const [updated] = await transaction.update(leads).set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), leadAccessCondition(input.access))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.assigned', entityType: 'lead', entityId: input.leadId, correlationId: input.correlationId, beforeState: { assignedToUserId: current.assignedToUserId }, afterState: { assignedToUserId: input.assignedToUserId } });
      const [row] = await transaction.select({ leadId: leads.id, accountId: accounts.id, accountName: accounts.name, accountSegmentId: accounts.segmentId, accountSegmentName: accountSegments.name, accountMarketSegment: accounts.marketSegment, accountStudentCount: accounts.studentCount, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt, assignedToUserId: leads.assignedToUserId, assignedToName: authUser.name }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(accountSegments, and(eq(accountSegments.id, accounts.segmentId), eq(accountSegments.organizationId, accounts.organizationId)))
        .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .leftJoin(authUser, eq(authUser.id, leads.assignedToUserId))
        .where(and(eq(leads.id, updated.id), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
}
