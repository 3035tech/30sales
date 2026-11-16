import { ConflictException, Injectable } from '@nestjs/common';
import { and, count, desc, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, agentSettings, auditEvents, campaignDraftAudiences, campaignDrafts, conversations, leadContacts, leads, messagingChannels, opportunities, people } from '../db/schema';
import { AUDIT_ACTOR_TYPE } from '../auth/authorization.constants';
import { CONTACT_OUTREACH_DECISION, LEAD_STATUS, SDR_ACTIVE_CONVERSATION_STATUSES, SDR_AGENT_KEY, SDR_READINESS_BLOCKER, SDR_READINESS_BLOCKERS } from '../leads/constants';
import { CAMPAIGN_AUDIENCE_AUDIT_ACTION, CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIT, CAMPAIGN_DRAFT_STATUS, CAMPAIGN_ERROR_CODE, DATABASE_FOREIGN_KEY_VIOLATION_CODE } from './campaigns.constants';
import { CampaignAudienceLeadDto, CampaignAudiencePreviewDto, CampaignAudiencePreviewRepositoryDto, CampaignAudienceSaveDto, CampaignAudienceSaveRepositoryDto, CampaignDraftCreateRepositoryDto, CampaignDraftDto, CampaignDraftListRepositoryDto, CampaignDraftPageDto, CampaignOperationalSnapshotDto, CampaignOperationalSnapshotRepositoryDto } from './campaigns.dto';
import type { LeadRepositoryAccessDto } from '../leads/leads.dto';
import type { SQL } from 'drizzle-orm';

function campaignLeadAccessCondition(access: LeadRepositoryAccessDto): SQL | undefined {
  if (access.canManageAll) return undefined;
  const assigned = eq(leads.assignedToUserId, access.userId);
  if (!access.includeOwnedOpportunities) return assigned;
  return or(assigned, exists(database.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.organizationId, access.organizationId), eq(opportunities.leadId, leads.id), eq(opportunities.ownerUserId, access.userId)))));
}

function audienceBlockers(candidate: { status: typeof leads.$inferSelect.status; primaryContactId: string | null; phone: string | null; hasConversation: boolean; outreachDecision: typeof leadContacts.$inferSelect.outreachDecision | null }, channelReady: boolean, agentReady: boolean): Array<(typeof SDR_READINESS_BLOCKERS)[number]> {
  const blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]> = [];
  if (candidate.status === LEAD_STATUS.doNotContact) blockers.push(SDR_READINESS_BLOCKER.doNotContact);
  else if (candidate.status !== LEAD_STATUS.ready) blockers.push(SDR_READINESS_BLOCKER.leadNotReady);
  if (!candidate.primaryContactId) blockers.push(SDR_READINESS_BLOCKER.primaryContactMissing);
  const digits = candidate.phone?.replace(/\D/g, '') ?? '';
  if (digits.length < 8 || digits.length > 15) blockers.push(SDR_READINESS_BLOCKER.phoneMissing);
  if (!channelReady) blockers.push(SDR_READINESS_BLOCKER.activeChannelMissing);
  if (!agentReady) blockers.push(SDR_READINESS_BLOCKER.assistantDisabled);
  if (candidate.hasConversation) blockers.push(SDR_READINESS_BLOCKER.existingConversation);
  if (candidate.outreachDecision === CONTACT_OUTREACH_DECISION.blocked) blockers.push(SDR_READINESS_BLOCKER.contactOutreachBlocked);
  else if (!candidate.outreachDecision || candidate.outreachDecision === CONTACT_OUTREACH_DECISION.pending) blockers.push(SDR_READINESS_BLOCKER.contactPermissionUnverified);
  return blockers;
}

@Injectable()
export class CampaignsRepository {
  async operationalSnapshot(input: CampaignOperationalSnapshotRepositoryDto): Promise<CampaignOperationalSnapshotDto | null> {
    const [draft] = await database.select({ channelId: campaignDrafts.channelId, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, channelActive: messagingChannels.isActive, channelConfigured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)` })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft))).limit(1);
    if (!draft) return null;
    const [audience] = await database.select({ total: count() }).from(campaignDraftAudiences)
      .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
    return new CampaignOperationalSnapshotDto(draft.channelId, audience?.total ?? 0, draft.channelActive, draft.channelConfigured, draft.windowStart, draft.windowEnd, draft.timeZone);
  }

  async list(input: CampaignDraftListRepositoryDto): Promise<CampaignDraftPageDto> {
    const { organizationId } = input;
    const { limit, offset } = input.query;
    const [rows, [totalRow]] = await Promise.all([database.select({ id: campaignDrafts.id, name: campaignDrafts.name, channelId: campaignDrafts.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, dailyMessageLimit: campaignDrafts.dailyMessageLimit, minimumDelaySeconds: campaignDrafts.minimumDelaySeconds, status: campaignDrafts.status, createdAt: campaignDrafts.createdAt })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(eq(campaignDrafts.organizationId, organizationId)).orderBy(desc(campaignDrafts.createdAt), desc(campaignDrafts.id)).limit(limit + 1).offset(offset),
      database.select({ total: count() }).from(campaignDrafts).where(eq(campaignDrafts.organizationId, organizationId)),
    ]);
    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const audienceCounts = pageRows.length === 0 ? [] : await database.select({ campaignDraftId: campaignDraftAudiences.campaignDraftId, total: count() }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, organizationId), inArray(campaignDraftAudiences.campaignDraftId, pageRows.map((row) => row.id)))).groupBy(campaignDraftAudiences.campaignDraftId);
    const audienceCountByDraft = new Map(audienceCounts.map((row) => [row.campaignDraftId, row.total]));
    const data = pageRows.map((row) => new CampaignDraftDto(row.id, row.name, row.channelId, row.channelName, row.channelPhoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, audienceCountByDraft.get(row.id) ?? 0, row.createdAt.toISOString()));
    return new CampaignDraftPageDto(data, { limit, offset, total: totalRow?.total ?? 0, hasNextPage });
  }

  async getAudiencePreview(input: CampaignAudiencePreviewRepositoryDto): Promise<CampaignAudiencePreviewDto | null> {
    const [draft] = await database.select({ channelId: campaignDrafts.channelId }).from(campaignDrafts)
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft))).limit(1);
    if (!draft) return null;
    const conditions = [eq(leads.organizationId, input.organizationId)];
    const accessCondition = campaignLeadAccessCondition(input.access);
    if (accessCondition) conditions.push(accessCondition);
    const [rows, [countRow], [channel], [agent], selectedRows] = await Promise.all([
      database.select({ leadId: leads.id, accountName: accounts.name, source: leads.source, status: leads.status, contactName: people.name, phone: people.phone, primaryContactId: leadContacts.id, outreachDecision: leadContacts.outreachDecision,
        hasConversation: sql<boolean>`${exists(database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}`,
      }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
        .where(and(...conditions)).orderBy(desc(leads.createdAt), desc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).where(and(...conditions)),
      database.select({ id: messagingChannels.id }).from(messagingChannels).where(and(eq(messagingChannels.id, draft.channelId), eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`)).limit(1),
      database.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) > 0` }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1),
      database.select({ leadId: campaignDraftAudiences.leadId }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), campaignLeadAccessCondition(input.access))),
    ]);
    const selectedLeadIds = selectedRows.map((row) => row.leadId);
    const selectedSet = new Set(selectedLeadIds);
    const channelReady = Boolean(channel);
    const agentReady = Boolean(agent?.enabled && agent.hasPrompt);
    const audience = rows.map((lead) => {
      const blockers = audienceBlockers(lead, channelReady, agentReady);
      return new CampaignAudienceLeadDto(lead.leadId, lead.accountName, lead.contactName, lead.phone, lead.status, lead.source, blockers, selectedSet.has(lead.leadId));
    });
    const eligible = audience.filter((lead) => lead.blockers.length === 0).length;
    const total = countRow?.total ?? 0;
    const [{ total: allSelectedCount }] = await database.select({ total: count() }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
    return new CampaignAudiencePreviewDto(audience, { eligible, excluded: audience.length - eligible }, selectedLeadIds, (allSelectedCount ?? 0) - selectedLeadIds.length, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }

  async saveAudience(input: CampaignAudienceSaveRepositoryDto): Promise<CampaignAudienceSaveDto | null> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ channelId: campaignDrafts.channelId }).from(campaignDrafts)
        .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft))).for('update').limit(1);
      if (!draft) return null;
      const [channel] = await transaction.select({ id: messagingChannels.id }).from(messagingChannels).where(and(eq(messagingChannels.id, draft.channelId), eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`)).limit(1);
      const [agent] = await transaction.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) > 0` }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1);
      const conditions = [eq(leads.organizationId, input.organizationId), inArray(leads.id, input.input.leadIds)];
      const accessCondition = campaignLeadAccessCondition(input.access);
      if (accessCondition) conditions.push(accessCondition);
      const candidates = input.input.leadIds.length === 0 ? [] : await transaction.select({ leadId: leads.id, status: leads.status, primaryContactId: leadContacts.id, phone: people.phone, outreachDecision: leadContacts.outreachDecision,
        hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}`,
      }).from(leads).leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId))).where(and(...conditions));
      if (candidates.length !== input.input.leadIds.length || candidates.some((lead) => audienceBlockers(lead, Boolean(channel), Boolean(agent?.enabled && agent.hasPrompt)).length > 0)) {
        throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.audienceIneligible, message: 'One or more selected leads are no longer eligible. Refresh the preview and review the exclusions.' });
      }
      const previousRows = await transaction.select({ leadId: campaignDraftAudiences.leadId, selectedByUserId: campaignDraftAudiences.selectedByUserId, createdAt: campaignDraftAudiences.createdAt }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
      const visibleLeadRows = previousRows.length === 0 ? [] : await transaction.select({ leadId: leads.id }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), campaignLeadAccessCondition(input.access)));
      const visibleLeadIds = new Set(visibleLeadRows.map((row) => row.leadId));
      const preservedRows = previousRows.filter((row) => !visibleLeadIds.has(row.leadId));
      const nextLeadIds = [...preservedRows.map((row) => row.leadId), ...input.input.leadIds];
      if (nextLeadIds.length > CAMPAIGN_AUDIENCE_MAX_LEADS) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.audienceLimit, message: 'The saved audience limit was exceeded. Ask an organization manager to review inaccessible selections.' });
      const nextLeadSet = new Set(nextLeadIds);
      if (previousRows.length === nextLeadSet.size && previousRows.every((row) => nextLeadSet.has(row.leadId))) return new CampaignAudienceSaveDto(input.campaignDraftId, nextLeadIds.length);
      await transaction.delete(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
      const audienceRows = [...preservedRows.map((row) => ({ organizationId: input.organizationId, campaignDraftId: input.campaignDraftId, leadId: row.leadId, selectedByUserId: row.selectedByUserId, createdAt: row.createdAt })), ...input.input.leadIds.map((leadId) => ({ organizationId: input.organizationId, campaignDraftId: input.campaignDraftId, leadId, selectedByUserId: input.userId }))];
      if (audienceRows.length > 0) await transaction.insert(campaignDraftAudiences).values(audienceRows);
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIENCE_AUDIT_ACTION, entityType: CAMPAIGN_AUDIT.entity, entityId: input.campaignDraftId, correlationId: input.correlationId, beforeState: { selectedCount: previousRows.length }, afterState: { selectedCount: nextLeadIds.length, visibleSelectedCount: input.input.leadIds.length } });
      return new CampaignAudienceSaveDto(input.campaignDraftId, nextLeadIds.length);
    });
  }

  async create(input: CampaignDraftCreateRepositoryDto): Promise<CampaignDraftDto | null> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id, displayName: messagingChannels.displayName, phoneNumber: messagingChannels.phoneNumber }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, input.input.channelId), eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`)).limit(1);
      if (!channel) return null;
      try {
        const [row] = await transaction.insert(campaignDrafts).values({ organizationId: input.organizationId, channelId: channel.id, name: input.input.name, windowStart: input.input.windowStart, windowEnd: input.input.windowEnd, timeZone: input.input.timeZone, dailyMessageLimit: input.input.dailyMessageLimit, minimumDelaySeconds: input.input.minimumDelaySeconds, status: CAMPAIGN_DRAFT_STATUS.draft, createdByUserId: input.userId }).returning();
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.created, entityType: CAMPAIGN_AUDIT.entity, entityId: row.id, correlationId: input.correlationId, afterState: { name: row.name, channelId: channel.id, windowStart: row.windowStart, windowEnd: row.windowEnd, timeZone: row.timeZone, dailyMessageLimit: row.dailyMessageLimit, minimumDelaySeconds: row.minimumDelaySeconds, status: row.status } });
        return new CampaignDraftDto(row.id, row.name, channel.id, channel.displayName, channel.phoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, 0, row.createdAt.toISOString());
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === DATABASE_FOREIGN_KEY_VIOLATION_CODE) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.channelInvalid, message: 'The selected channel is no longer available.' });
        throw error;
      }
    });
  }
}
