import { ConflictException, Injectable } from '@nestjs/common';
import { and, count, desc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { accounts, activities, agentSettings, assistantProfiles, auditEvents, businessLineMembers, businessLines, campaignDraftAudiences, campaignDraftChannels, campaignDrafts, channelBusinessHours, conversations, leadContacts, leadStatusHistory, leads, messages, messagingChannels, opportunities, people, pipelineStages, outboxEvents, tasks } from '../db/schema';
import { AUDIT_ACTOR_TYPE } from '../auth/authorization.constants';
import { CONTACT_OUTREACH_DECISION, LEAD_STATUS, SDR_ACTIVE_CONVERSATION_STATUSES, SDR_AGENT_KEY, SDR_READINESS_BLOCKER, SDR_READINESS_BLOCKERS } from '../leads/constants';
import { CAMPAIGN_AUDIENCE_AUDIT_ACTION, CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIT, CAMPAIGN_DRAFT_STATUS, CAMPAIGN_ERROR_CODE, CAMPAIGN_OUTBOX_STATUS, CAMPAIGN_OUTREACH_EVENT, CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX, CAMPAIGN_OUTREACH_LEASE_SECONDS, CAMPAIGN_OUTREACH_REVIEW_CODE, CAMPAIGN_PENDING_REPLY_CONVERSATION_STATUSES, DATABASE_FOREIGN_KEY_VIOLATION_CODE } from './campaigns.constants';
import { CampaignAudienceLeadDto, CampaignAudiencePreviewDto, CampaignAudiencePreviewRepositoryDto, CampaignAudienceSaveDto, CampaignAudienceSaveRepositoryDto, CampaignChannelPerformanceDto, CampaignChannelQuotaSnapshotDto, CampaignDeliveryConfirmDto, CampaignDeliveryConfirmRepositoryDto, CampaignDeliveryRetryDto, CampaignDeliveryRetryRepositoryDto, CampaignDeliveryReviewItemDto, CampaignDeliveryReviewPageDto, CampaignDeliveryReviewRepositoryDto, CampaignDraftCreateRepositoryDto, CampaignDraftDto, CampaignDraftListRepositoryDto, CampaignDraftPageDto, CampaignLeadPerformanceItemDto, CampaignLeadPerformancePageDto, CampaignLeadPerformanceRepositoryDto, CampaignOperationalSnapshotDto, CampaignOperationalSnapshotRepositoryDto, CampaignPerformanceDto, CampaignPerformanceRepositoryDto, CampaignPendingReplyDto, CampaignPendingRepliesPageDto, CampaignPendingRepliesRepositoryDto, CampaignSelectedChannelDto, CampaignSelectedChannelsRepositoryDto, CampaignStartRepositoryDto, CampaignStartResultDto, CampaignStatusChangeDto, CampaignStatusChangeRepositoryDto } from './campaigns.dto';
import type { LeadRepositoryAccessDto } from '../leads/leads.dto';
import type { SQL } from 'drizzle-orm';
import { CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE } from '../channels/channels.constants';
import { isWithinBusinessHours } from '../channels/channel-assistant-schedule';
import { organization as authOrganization } from '../db/auth-schema';
import { CAMPAIGN_NATIONAL_HOLIDAY_PRESETS, CAMPAIGN_NO_SEND_DATE_AUDIT, CAMPAIGN_NO_SEND_DATE_LIMITS, CAMPAIGN_NO_SEND_DATE_SOURCE } from './campaigns.constants';
import { CampaignNoSendDateDeleteRepositoryDto, CampaignNoSendDateDto, CampaignNoSendDateMutationRepositoryDto } from './campaigns.dto';
import { campaignNoSendDates } from '../db/schema';
import { z } from 'zod';
import { channelOperationModeSchema, channelProviderSchema } from '../channels/channels.dto';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { hasOrganizationRole, ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

const campaignDeliveryConfirmationPayloadSchema = z.object({ campaignDraftId: z.string().min(1), leadId: z.string().min(1) });
const campaignOutreachPayloadSchema = z.object({ organizationId: z.string().min(1), actorUserId: z.string().min(1), campaignDraftId: z.string().min(1), channelId: z.string().min(1), leadId: z.string().min(1) });

function campaignLeadAccessCondition(access: LeadRepositoryAccessDto): SQL | undefined {
  if (access.canManageAll) return undefined;
  const assigned = eq(leads.assignedToUserId, access.userId);
  if (!access.includeOwnedOpportunities) return assigned;
  return or(assigned, exists(database.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.organizationId, access.organizationId), eq(opportunities.leadId, leads.id), eq(opportunities.ownerUserId, access.userId)))));
}

function campaignLineAccessCondition(access: LeadRepositoryAccessDto): SQL | undefined {
  if (access.canManageAll) return undefined;
  return exists(database.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
    .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
    .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
    .where(and(eq(businessLineMembers.organizationId, access.organizationId), eq(businessLineMembers.businessLineId, messagingChannels.businessLineId), eq(authMember.userId, access.userId), eq(businessLines.status, 'active'))));
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

function getLocalCampaignDateTime(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

@Injectable()
export class CampaignsRepository {
  private async hasReadyOutboundAssistant(organizationId: string, businessLineId: string, channelIds: string[], legacyAgentReady: boolean): Promise<boolean> {
    if (channelIds.length === 0) return false;
    const channels = await database.select({ id: messagingChannels.id, profileId: messagingChannels.outboundAssistantProfileId, operationMode: messagingChannels.operationMode, isActive: messagingChannels.isActive, configured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)` }).from(messagingChannels)
      .where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.businessLineId, businessLineId), inArray(messagingChannels.id, channelIds)));
    const profileIds = channels.flatMap((channel) => channel.profileId ? [channel.profileId] : []);
    const readyProfiles = profileIds.length ? await database.select({ id: assistantProfiles.id }).from(assistantProfiles)
      .where(and(eq(assistantProfiles.organizationId, organizationId), eq(assistantProfiles.businessLineId, businessLineId), eq(assistantProfiles.direction, 'outbound'), eq(assistantProfiles.enabled, true), sql`length(trim(${assistantProfiles.systemPrompt})) >= 100`, inArray(assistantProfiles.id, profileIds))) : [];
    const readyProfileIds = new Set(readyProfiles.map((profile) => profile.id));
    return channels.some((channel) => channel.isActive && channel.configured && channel.operationMode !== 'inbound' && (channel.profileId ? readyProfileIds.has(channel.profileId) : legacyAgentReady));
  }

  async selectedChannels(input: CampaignSelectedChannelsRepositoryDto): Promise<CampaignSelectedChannelDto[] | null> {
    const [draft] = await database.select({ channelId: campaignDrafts.channelId, businessLineId: messagingChannels.businessLineId }).from(campaignDrafts)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId))).limit(1);
    if (!draft || !draft.businessLineId) return null;
    const rows = await database.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, provider: messagingChannels.provider, active: messagingChannels.isActive, configured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)`, operationMode: messagingChannels.operationMode }).from(campaignDraftChannels)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDraftChannels.channelId), eq(messagingChannels.organizationId, campaignDraftChannels.organizationId)))
      .where(and(eq(campaignDraftChannels.organizationId, input.organizationId), eq(campaignDraftChannels.campaignDraftId, input.campaignDraftId))).orderBy(campaignDraftChannels.position);
    if (rows.length) {
      if (rows.some((row) => row.businessLineId !== draft.businessLineId)) return null;
      return rows.map((row) => new CampaignSelectedChannelDto(row.id, channelProviderSchema.parse(row.provider), row.active, row.configured, channelOperationModeSchema.parse(row.operationMode)));
    }
    const [primary] = await database.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, provider: messagingChannels.provider, active: messagingChannels.isActive, configured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)`, operationMode: messagingChannels.operationMode }).from(messagingChannels)
      .where(and(eq(messagingChannels.id, draft.channelId), eq(messagingChannels.organizationId, input.organizationId))).limit(1);
    return primary && primary.businessLineId === draft.businessLineId ? [new CampaignSelectedChannelDto(primary.id, channelProviderSchema.parse(primary.provider), primary.active, primary.configured, channelOperationModeSchema.parse(primary.operationMode))] : null;
  }
  async listDeliveryReview(input: CampaignDeliveryReviewRepositoryDto): Promise<CampaignDeliveryReviewPageDto> {
    const where = and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed), eq(outboxEvents.lastErrorCode, CAMPAIGN_OUTREACH_REVIEW_CODE), campaignLineAccessCondition(input.access));
    const [summary] = await database.select({ total: count() }).from(outboxEvents)
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.id, outboxEvents.aggregateId), eq(campaignDrafts.organizationId, outboxEvents.organizationId)))
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId))).where(where);
    const rows = await database.select({ outboxEventId: outboxEvents.id, campaignDraftId: campaignDrafts.id, campaignName: campaignDrafts.name, leadId: leads.id, accountName: accounts.name, contactName: people.name, phone: people.phone, deliveryState: messages.deliveryState, lastErrorCode: outboxEvents.lastErrorCode, attempts: outboxEvents.attempts, createdAt: outboxEvents.createdAt })
      .from(outboxEvents)
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.id, outboxEvents.aggregateId), eq(campaignDrafts.organizationId, outboxEvents.organizationId)))
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .leftJoin(leads, and(sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`, eq(leads.organizationId, outboxEvents.organizationId), eq(leads.businessLineId, messagingChannels.businessLineId)))
      .leftJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
      .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
      .leftJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${campaignDrafts.id}::text || ':' || ${leads.id}::text`))
      .where(where).orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id)).limit(input.limit).offset(input.offset);
    const total = summary?.total ?? 0;
    return new CampaignDeliveryReviewPageDto(rows.map((row) => new CampaignDeliveryReviewItemDto(row.outboxEventId, row.campaignDraftId, row.campaignName, row.leadId ?? '', row.accountName ?? '', row.contactName, row.phone, row.deliveryState, row.lastErrorCode, Number(row.attempts), row.createdAt.toISOString())), { limit: input.limit, offset: input.offset, total, hasNextPage: input.offset + rows.length < total });
  }

  async performance(input: CampaignPerformanceRepositoryDto): Promise<CampaignPerformanceDto | null> {
    const [draft] = await database.select({ id: campaignDrafts.id, businessLineId: messagingChannels.businessLineId }).from(campaignDrafts)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), campaignLineAccessCondition(input.access))).limit(1);
    if (!draft || !draft.businessLineId) return null;
    const rows = await database.select({
      channelId: messagingChannels.id,
      channelLabel: sql<string>`${messagingChannels.displayName} || ' · ' || ${messagingChannels.phoneNumber}`,
      total: sql<number>`count(*)::int`,
      queued: sql<number>`count(*) filter (where ${outboxEvents.status} = ${CAMPAIGN_OUTBOX_STATUS.pending})::int`,
      processing: sql<number>`count(*) filter (where ${outboxEvents.status} = ${CAMPAIGN_OUTBOX_STATUS.processing})::int`,
      sent: sql<number>`count(*) filter (where ${messages.deliveryState} in ('accepted', 'delivered', 'read'))::int`,
      delivered: sql<number>`count(*) filter (where ${messages.deliveryState} in ('delivered', 'read'))::int`,
      replied: sql<number>`count(*) filter (where ${messages.deliveryState} in ('accepted', 'delivered', 'read') and exists (select 1 from ${messages} inbound where inbound.organization_id = ${outboxEvents.organizationId} and inbound.conversation_id = ${messages.conversationId} and inbound.direction = 'inbound' and inbound.occurred_at > ${messages.occurredAt}))::int`,
      meetings: sql<number>`count(*) filter (where ${messages.deliveryState} in ('accepted', 'delivered', 'read') and exists (select 1 from ${activities} meeting where meeting.organization_id = ${opportunities.organizationId} and meeting.opportunity_id = ${opportunities.id} and meeting.type = 'meeting' and meeting.occurred_at > ${messages.occurredAt}))::int`,
      opportunitiesCreated: sql<number>`count(*) filter (where ${messages.deliveryState} in ('accepted', 'delivered', 'read') and ${opportunities.createdAt} > ${messages.occurredAt})::int`,
      won: sql<number>`count(*) filter (where ${messages.deliveryState} in ('accepted', 'delivered', 'read') and ${opportunities.createdAt} > ${messages.occurredAt} and ${opportunities.stage} = 'won')::int`,
      needsReview: sql<number>`count(*) filter (where ${outboxEvents.status} = ${CAMPAIGN_OUTBOX_STATUS.failed})::int`,
    }).from(outboxEvents)
      .innerJoin(messagingChannels, and(eq(messagingChannels.organizationId, outboxEvents.organizationId), sql`${messagingChannels.id}::text = ${outboxEvents.payload}->>'channelId'`))
      .leftJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${input.campaignDraftId} || ':' || (${outboxEvents.payload}->>'leadId')`))
      .leftJoin(opportunities, and(eq(opportunities.organizationId, outboxEvents.organizationId), sql`${opportunities.leadId}::text = ${outboxEvents.payload}->>'leadId'`))
      .where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(messagingChannels.businessLineId, draft.businessLineId), campaignLineAccessCondition(input.access)))
      .groupBy(messagingChannels.id, messagingChannels.displayName, messagingChannels.phoneNumber)
      .orderBy(messagingChannels.displayName, messagingChannels.phoneNumber);
    return new CampaignPerformanceDto(input.campaignDraftId, rows.reduce((sum, row) => sum + row.total, 0), rows.map((row) => new CampaignChannelPerformanceDto(row.channelId, row.channelLabel, row.queued, row.processing, row.sent, row.delivered, row.replied, row.meetings, row.opportunitiesCreated, row.won, row.needsReview)));
  }

  async performanceLeads(input: CampaignLeadPerformanceRepositoryDto): Promise<CampaignLeadPerformancePageDto | null> {
    const [draft] = await database.select({ id: campaignDrafts.id, businessLineId: messagingChannels.businessLineId }).from(campaignDrafts)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), campaignLineAccessCondition(input.access))).limit(1);
    if (!draft || !draft.businessLineId) return null;
    const where = and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(messagingChannels.businessLineId, draft.businessLineId), eq(leads.businessLineId, draft.businessLineId), campaignLineAccessCondition(input.access));
    const [[summary], rows] = await Promise.all([
      database.select({ total: count() }).from(outboxEvents)
        .innerJoin(messagingChannels, and(eq(messagingChannels.organizationId, outboxEvents.organizationId), sql`${messagingChannels.id}::text = ${outboxEvents.payload}->>'channelId'`))
        .innerJoin(leads, and(sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`, eq(leads.organizationId, outboxEvents.organizationId))).where(where),
      database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, phone: people.phone, channelId: sql<string>`${outboxEvents.payload}->>'channelId'`, channelDisplayName: sql<string>`coalesce(${outboxEvents.payload}->>'channelDisplayName', ${messagingChannels.displayName})`, channelPhoneNumber: sql<string>`coalesce(${outboxEvents.payload}->>'channelPhoneNumber', ${messagingChannels.phoneNumber})`, outboxStatus: outboxEvents.status, deliveryState: messages.deliveryState, replied: sql<boolean>`${messages.deliveryState} in ('accepted', 'delivered', 'read') and exists (select 1 from ${messages} inbound where inbound.organization_id = ${outboxEvents.organizationId} and inbound.conversation_id = ${messages.conversationId} and inbound.direction = 'inbound' and inbound.occurred_at > ${messages.occurredAt})`, conversationId: conversations.id, opportunityStage: opportunities.stage, opportunityStageLabel: pipelineStages.name, opportunityCreatedAfterCampaign: sql<boolean>`${messages.deliveryState} in ('accepted', 'delivered', 'read') and coalesce(${opportunities.createdAt} > ${messages.occurredAt}, false)`, meetingAfterCampaign: sql<boolean>`${messages.deliveryState} in ('accepted', 'delivered', 'read') and exists (select 1 from ${activities} meeting where meeting.organization_id = ${opportunities.organizationId} and meeting.opportunity_id = ${opportunities.id} and meeting.type = 'meeting' and meeting.occurred_at > ${messages.occurredAt})`, wonAfterCampaign: sql<boolean>`${messages.deliveryState} in ('accepted', 'delivered', 'read') and coalesce(${opportunities.createdAt} > ${messages.occurredAt}, false) and ${opportunities.stage} = 'won'` })
        .from(outboxEvents)
        .leftJoin(leads, and(sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`, eq(leads.organizationId, outboxEvents.organizationId)))
        .leftJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${input.campaignDraftId} || ':' || (${outboxEvents.payload}->>'leadId')`))
        .leftJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .leftJoin(opportunities, and(eq(opportunities.organizationId, leads.organizationId), eq(opportunities.leadId, leads.id)))
        .leftJoin(pipelineStages, and(eq(pipelineStages.organizationId, opportunities.organizationId), eq(pipelineStages.key, opportunities.pipelineStageKey)))
        .leftJoin(people, and(eq(people.organizationId, leads.organizationId), sql`${people.id} = coalesce(${conversations.personId}, ${leadContacts.personId})`))
      .leftJoin(messagingChannels, and(eq(messagingChannels.organizationId, outboxEvents.organizationId), sql`${messagingChannels.id}::text = ${outboxEvents.payload}->>'channelId'`))
        .where(where).orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id)).limit(input.query.limit).offset(input.query.offset),
    ]);
    const total = summary?.total ?? 0;
    const data = rows.flatMap((row) => row.leadId && row.channelId ? [new CampaignLeadPerformanceItemDto(row.leadId, row.accountName ?? '', row.contactName, row.phone, row.channelId, `${row.channelDisplayName ?? ''} · ${row.channelPhoneNumber ?? ''}`.trim(), row.outboxStatus === CAMPAIGN_OUTBOX_STATUS.processing ? CAMPAIGN_OUTBOX_STATUS.pending : row.outboxStatus, row.outboxStatus === CAMPAIGN_OUTBOX_STATUS.processing, row.deliveryState, row.replied, row.conversationId, row.opportunityStage, row.opportunityStage === 'custom' ? row.opportunityStageLabel : null, row.opportunityCreatedAfterCampaign, row.meetingAfterCampaign, row.wonAfterCampaign)] : []);
    return new CampaignLeadPerformancePageDto(input.campaignDraftId, data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }

  async pendingReplies(input: CampaignPendingRepliesRepositoryDto): Promise<CampaignPendingRepliesPageDto> {
    const replyQueueOwner = alias(authUser, 'campaign_reply_owner');
    const pendingInbound = sql`exists (
      select 1 from ${messages} pending_inbound
      where pending_inbound.organization_id = ${outboxEvents.organizationId}
        and pending_inbound.conversation_id = ${conversations.id}
        and pending_inbound.direction = 'inbound'
        and pending_inbound.occurred_at > ${messages.occurredAt}
        and not exists (
          select 1 from ${messages} later_outbound
          where later_outbound.organization_id = pending_inbound.organization_id
            and later_outbound.conversation_id = pending_inbound.conversation_id
            and later_outbound.direction = 'outbound'
            and later_outbound.created_at > pending_inbound.created_at
        )
    )`;
    const conditions = and(
      eq(outboxEvents.organizationId, input.organizationId),
      eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT),
      sql`${campaignDrafts.id}::text = ${outboxEvents.aggregateId}`,
      eq(leads.organizationId, input.organizationId),
      eq(leads.businessLineId, messagingChannels.businessLineId),
      inArray(conversations.status, CAMPAIGN_PENDING_REPLY_CONVERSATION_STATUSES),
      pendingInbound,
      campaignLineAccessCondition(input.access),
    );
    const [summary] = await database.select({ total: count() }).from(outboxEvents)
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.organizationId, outboxEvents.organizationId), sql`${campaignDrafts.id}::text = ${outboxEvents.aggregateId}`))
      .innerJoin(messagingChannels, and(eq(messagingChannels.organizationId, outboxEvents.organizationId), sql`${messagingChannels.id}::text = ${outboxEvents.payload}->>'channelId'`))
      .innerJoin(leads, and(eq(leads.organizationId, outboxEvents.organizationId), sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`))
      .innerJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${outboxEvents.aggregateId} || ':' || (${outboxEvents.payload}->>'leadId')`, eq(messages.direction, 'outbound')))
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
      .where(conditions);
    const rows = await database.select({
      campaignDraftId: campaignDrafts.id,
      campaignName: campaignDrafts.name,
      leadId: leads.id,
      accountName: accounts.name,
      contactName: people.name,
      phone: people.phone,
      channelLabel: sql<string>`${messagingChannels.displayName} || ' · ' || ${messagingChannels.phoneNumber}`,
      conversationId: conversations.id,
      ownerName: replyQueueOwner.name,
      hasOpenTask: sql<boolean>`exists (select 1 from ${tasks} open_task where open_task.organization_id = ${leads.organizationId} and open_task.lead_id = ${leads.id} and open_task.status = 'open')`,
      replyPreview: sql<string | null>`(select nullif(left(coalesce(pending_inbound.body_text, pending_inbound.transcript_text, ''), 180), '') from ${messages} pending_inbound where pending_inbound.organization_id = ${outboxEvents.organizationId} and pending_inbound.conversation_id = ${conversations.id} and pending_inbound.direction = 'inbound' and pending_inbound.occurred_at > ${messages.occurredAt} and not exists (select 1 from ${messages} later_outbound where later_outbound.organization_id = pending_inbound.organization_id and later_outbound.conversation_id = pending_inbound.conversation_id and later_outbound.direction = 'outbound' and later_outbound.created_at > pending_inbound.created_at) order by pending_inbound.occurred_at desc, pending_inbound.created_at desc limit 1)`,
      repliedAt: sql<Date | null>`(select pending_inbound.occurred_at from ${messages} pending_inbound where pending_inbound.organization_id = ${outboxEvents.organizationId} and pending_inbound.conversation_id = ${conversations.id} and pending_inbound.direction = 'inbound' and pending_inbound.occurred_at > ${messages.occurredAt} and not exists (select 1 from ${messages} later_outbound where later_outbound.organization_id = pending_inbound.organization_id and later_outbound.conversation_id = pending_inbound.conversation_id and later_outbound.direction = 'outbound' and later_outbound.created_at > pending_inbound.created_at) order by pending_inbound.occurred_at desc, pending_inbound.created_at desc limit 1)`,
    }).from(outboxEvents)
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.organizationId, outboxEvents.organizationId), sql`${campaignDrafts.id}::text = ${outboxEvents.aggregateId}`))
      .innerJoin(messagingChannels, and(eq(messagingChannels.organizationId, outboxEvents.organizationId), sql`${messagingChannels.id}::text = ${outboxEvents.payload}->>'channelId'`))
      .innerJoin(leads, and(eq(leads.organizationId, outboxEvents.organizationId), sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`))
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${outboxEvents.aggregateId} || ':' || (${outboxEvents.payload}->>'leadId')`, eq(messages.direction, 'outbound')))
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(replyQueueOwner, eq(replyQueueOwner.id, conversations.ownerUserId))
      .where(conditions)
      .orderBy(desc(sql`(select pending_inbound.occurred_at from ${messages} pending_inbound where pending_inbound.organization_id = ${outboxEvents.organizationId} and pending_inbound.conversation_id = ${conversations.id} and pending_inbound.direction = 'inbound' and pending_inbound.occurred_at > ${messages.occurredAt} order by pending_inbound.occurred_at desc, pending_inbound.created_at desc limit 1)`), desc(outboxEvents.id))
      .limit(input.query.limit).offset(input.query.offset);
    const data = rows.flatMap((row) => row.repliedAt ? [new CampaignPendingReplyDto(row.campaignDraftId, row.campaignName, row.leadId, row.accountName, row.contactName, row.phone, row.channelLabel, row.conversationId, row.ownerName, row.hasOpenTask, row.replyPreview, row.repliedAt.toISOString())] : []);
    const total = summary?.total ?? 0;
    return new CampaignPendingRepliesPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  async confirmDelivery(input: CampaignDeliveryConfirmRepositoryDto): Promise<CampaignDeliveryConfirmDto | null> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.select({ id: outboxEvents.id, aggregateId: outboxEvents.aggregateId, businessLineId: messagingChannels.businessLineId, payload: outboxEvents.payload })
        .from(outboxEvents).innerJoin(campaignDrafts, and(eq(campaignDrafts.id, outboxEvents.aggregateId), eq(campaignDrafts.organizationId, outboxEvents.organizationId)))
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
        .where(and(eq(outboxEvents.id, input.outboxEventId), eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed), eq(outboxEvents.lastErrorCode, CAMPAIGN_OUTREACH_REVIEW_CODE), campaignLineAccessCondition(input.access))).for('update').limit(1);
      if (!event || !event.businessLineId) return null;
      const parsedPayload = campaignDeliveryConfirmationPayloadSchema.safeParse(event.payload);
      if (!parsedPayload.success || parsedPayload.data.campaignDraftId !== event.aggregateId) return null;
      const payload = parsedPayload.data;
      const [lead] = await transaction.select({ id: leads.id }).from(leads).where(and(eq(leads.id, payload.leadId), eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, event.businessLineId))).limit(1);
      if (!lead) return null;
      const idempotencyKey = `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${payload.campaignDraftId}:${payload.leadId}`;
      const [message] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, deliveryState: messages.deliveryState })
        .from(messages).where(and(eq(messages.organizationId, input.organizationId), eq(messages.idempotencyKey, idempotencyKey), eq(messages.direction, 'outbound'))).for('update').limit(1);
      if (!message || !['requested', 'unknown', 'failed', 'accepted', 'delivered', 'read'].includes(message.deliveryState)) return null;
      const now = new Date();
      const confirmedDeliveryState = ['accepted', 'delivered', 'read'].includes(message.deliveryState) ? message.deliveryState : 'accepted';
      await transaction.update(messages).set({ deliveryState: confirmedDeliveryState }).where(and(eq(messages.id, message.id), eq(messages.organizationId, input.organizationId)));
      await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.published, publishedAt: now, lastErrorCode: null }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
      const [updatedLead] = await transaction.update(leads).set({ status: LEAD_STATUS.contacting, updatedAt: now }).where(and(eq(leads.id, payload.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, LEAD_STATUS.ready))).returning({ id: leads.id });
      if (updatedLead) await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: updatedLead.id, fromStatus: LEAD_STATUS.ready, toStatus: LEAD_STATUS.contacting, changedByUserId: input.actorUserId });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.deliveryConfirmedSent, entityType: CAMPAIGN_AUDIT.entity, entityId: event.aggregateId, correlationId: input.correlationId, beforeState: { deliveryState: message.deliveryState }, afterState: { outboxEventId: event.id, leadId: payload.leadId, messageId: message.id, conversationId: message.conversationId, deliveryState: confirmedDeliveryState } });
      const [remaining] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, event.aggregateId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), inArray(outboxEvents.status, [CAMPAIGN_OUTBOX_STATUS.pending, CAMPAIGN_OUTBOX_STATUS.processing])));
      const [needsReview] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, event.aggregateId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
      if ((remaining?.total ?? 0) === 0 && (needsReview?.total ?? 0) === 0) await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.completed, updatedAt: now }).where(and(eq(campaignDrafts.id, event.aggregateId), eq(campaignDrafts.organizationId, input.organizationId), inArray(campaignDrafts.status, [CAMPAIGN_DRAFT_STATUS.active, CAMPAIGN_DRAFT_STATUS.paused])));
      return new CampaignDeliveryConfirmDto(event.id, CAMPAIGN_OUTBOX_STATUS.published);
    });
  }

  async retryDelivery(input: CampaignDeliveryRetryRepositoryDto): Promise<CampaignDeliveryRetryDto | null> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.select({ id: outboxEvents.id, aggregateId: outboxEvents.aggregateId, businessLineId: messagingChannels.businessLineId, payload: outboxEvents.payload })
        .from(outboxEvents).innerJoin(campaignDrafts, and(eq(campaignDrafts.id, outboxEvents.aggregateId), eq(campaignDrafts.organizationId, outboxEvents.organizationId)))
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
        .where(and(eq(outboxEvents.id, input.outboxEventId), eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed), eq(outboxEvents.lastErrorCode, CAMPAIGN_OUTREACH_REVIEW_CODE), campaignLineAccessCondition(input.access))).for('update').limit(1);
      if (!event?.businessLineId) return null;
      const parsedPayload = campaignOutreachPayloadSchema.safeParse(event.payload);
      if (!parsedPayload.success || parsedPayload.data.organizationId !== input.organizationId || parsedPayload.data.campaignDraftId !== event.aggregateId) return null;
      const payload = parsedPayload.data;
      const [assignedChannel] = await transaction.select({ businessLineId: messagingChannels.businessLineId, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, payload.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('share').limit(1);
      if (!assignedChannel || assignedChannel.businessLineId !== event.businessLineId) return null;
      const [lead] = await transaction.select({ id: leads.id }).from(leads).where(and(eq(leads.id, payload.leadId), eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, event.businessLineId))).limit(1);
      if (!lead) return null;
      const idempotencyKey = `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${payload.campaignDraftId}:${payload.leadId}`;
      const [message] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt })
        .from(messages).where(and(eq(messages.organizationId, input.organizationId), eq(messages.idempotencyKey, idempotencyKey), eq(messages.direction, 'outbound'))).for('update').limit(1);
      if (message && !['requested', 'unknown', 'failed'].includes(message.deliveryState)) return null;
      if (message) {
        const [reply] = await transaction.select({ id: messages.id }).from(messages)
          .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, message.conversationId), eq(messages.direction, 'inbound'), sql`${messages.occurredAt} >= ${message.occurredAt}`)).limit(1);
        if (reply) return null;
      }
      const now = new Date();
      const reservedDate = getLocalCampaignDateTime(now, assignedChannel.dailyLimitTimeZone).date;
      if (message) await transaction.update(messages).set({ deliveryState: 'failed', externalMessageId: null })
        .where(and(eq(messages.id, message.id), eq(messages.organizationId, input.organizationId)));
      await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.pending, availableAt: now, publishedAt: null, lastErrorCode: null, payload: sql`jsonb_set(${outboxEvents.payload}, '{reservedDate}', to_jsonb(${reservedDate}::text), true)` })
        .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.deliveryConfirmedNotSentRequeued, entityType: CAMPAIGN_AUDIT.entity, entityId: event.aggregateId, correlationId: input.correlationId, beforeState: { outboxEventId: event.id, deliveryState: message?.deliveryState ?? null }, afterState: { outboxEventId: event.id, leadId: payload.leadId, messageId: message?.id ?? null, status: CAMPAIGN_OUTBOX_STATUS.pending } });
      return new CampaignDeliveryRetryDto(event.id, CAMPAIGN_OUTBOX_STATUS.pending);
    });
  }

  async start(input: CampaignStartRepositoryDto): Promise<CampaignStartResultDto | 'not_found' | 'already_started' | 'not_ready' | 'ineligible' | 'quota_exceeded'> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ id: campaignDrafts.id, channelId: campaignDrafts.channelId, businessLineId: messagingChannels.businessLineId, businessLineStatus: businessLines.status, name: campaignDrafts.name, openingMessage: campaignDrafts.openingMessage, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, dailyMessageLimit: campaignDrafts.dailyMessageLimit, minimumDelaySeconds: campaignDrafts.minimumDelaySeconds, status: campaignDrafts.status })
        .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId))).leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId))).where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), campaignLineAccessCondition(input.access))).for('update', { of: campaignDrafts }).limit(1);
      if (!draft) return 'not_found';
      if (!draft.businessLineId) return 'not_ready';
      if (draft.businessLineId && draft.businessLineStatus !== 'active') return 'not_ready';
      if (draft.status !== CAMPAIGN_DRAFT_STATUS.draft) return 'already_started';

      const linkedChannels = await transaction.select({ channelId: campaignDraftChannels.channelId }).from(campaignDraftChannels)
        .where(and(eq(campaignDraftChannels.organizationId, input.organizationId), eq(campaignDraftChannels.campaignDraftId, draft.id))).orderBy(campaignDraftChannels.position);
      const requestedChannelIds = linkedChannels.length ? linkedChannels.map((row) => row.channelId) : [draft.channelId];
      const lockedChannels = await transaction.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, displayName: messagingChannels.displayName, phoneNumber: messagingChannels.phoneNumber, operationMode: messagingChannels.operationMode, outboundAssistantProfileId: messagingChannels.outboundAssistantProfileId, isActive: messagingChannels.isActive, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).where(and(inArray(messagingChannels.id, requestedChannelIds), eq(messagingChannels.organizationId, input.organizationId))).orderBy(messagingChannels.id).for('update');
      if (lockedChannels.length !== requestedChannelIds.length) return 'not_ready';
      if (lockedChannels.some((channel) => channel.businessLineId !== draft.businessLineId)) return 'not_ready';
      let channels = lockedChannels.filter((channel) => input.availableChannelIds.includes(channel.id) && channel.isActive && channel.operationMode !== 'inbound' && channel.credentialsCiphertext && channel.credentialsIv && channel.credentialsAuthTag)
        .sort((left, right) => requestedChannelIds.indexOf(left.id) - requestedChannelIds.indexOf(right.id));
      if (channels.length === 0) return 'not_ready';
      const [agent] = await transaction.select({ enabled: agentSettings.enabled, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY), draft.businessLineId ? or(eq(agentSettings.businessLineId, draft.businessLineId), isNull(agentSettings.businessLineId)) : isNull(agentSettings.businessLineId)))
        .orderBy(desc(sql`(${agentSettings.businessLineId} is not null)`)).limit(1);
      const profileIds = channels.flatMap((channel) => channel.outboundAssistantProfileId ? [channel.outboundAssistantProfileId] : []);
      const readyProfiles = profileIds.length ? await transaction.select({ id: assistantProfiles.id }).from(assistantProfiles)
        .where(and(eq(assistantProfiles.organizationId, input.organizationId), eq(assistantProfiles.businessLineId, draft.businessLineId), eq(assistantProfiles.direction, 'outbound'), eq(assistantProfiles.enabled, true), sql`length(trim(${assistantProfiles.systemPrompt})) >= 100`, inArray(assistantProfiles.id, profileIds))) : [];
      const readyProfileIds = new Set(readyProfiles.map((profile) => profile.id));
      const legacyAgentReady = Boolean(agent?.enabled && agent.systemPrompt.trim().length >= 100);
      channels = channels.filter((channel) => channel.outboundAssistantProfileId ? readyProfileIds.has(channel.outboundAssistantProfileId) : legacyAgentReady);
      if (channels.length === 0) return 'not_ready';

      const [audienceCount] = await transaction.select({ total: count() }).from(campaignDraftAudiences)
        .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, draft.id)));
      if (!audienceCount?.total || audienceCount.total > CAMPAIGN_AUDIENCE_MAX_LEADS) return 'ineligible';
      if (audienceCount.total > draft.dailyMessageLimit) return 'quota_exceeded';

      const candidates = await transaction.select({ leadId: leads.id, status: leads.status, accountId: leads.accountId, accountName: accounts.name, primaryContactId: leadContacts.personId, personName: people.name, phone: people.phone, outreachDecision: leadContacts.outreachDecision, hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), inArray(conversations.channelId, channels.map((channel) => channel.id)), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}` })
        .from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId)))
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
        .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, draft.id), eq(leads.businessLineId, draft.businessLineId))).orderBy(leads.createdAt, leads.id);
      if (candidates.length !== audienceCount.total || candidates.some((candidate) => audienceBlockers(candidate, true, true).length > 0)) return 'ineligible';

      const now = new Date();
      const local = getLocalCampaignDateTime(now, draft.timeZone);
      const [holiday] = await transaction.select({ id: campaignNoSendDates.id }).from(campaignNoSendDates).where(and(eq(campaignNoSendDates.organizationId, input.organizationId), eq(campaignNoSendDates.date, local.date))).limit(1);
      if (local.time < draft.windowStart || local.time >= draft.windowEnd || holiday) return 'not_ready';
      const readyChannels: Array<{ id: string; displayName: string; phoneNumber: string; reservedDate: string; remaining: number }> = [];
      let openChannelCount = 0;
      for (const channel of channels) {
        const channelHours = await transaction.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
          .where(and(eq(channelBusinessHours.organizationId, input.organizationId), eq(channelBusinessHours.channelId, channel.id)));
        if (!isWithinBusinessHours({ timeZone: channel.dailyLimitTimeZone, businessHours: channelHours, at: now })) continue;
        openChannelCount += 1;
        const [usedMessages] = await transaction.select({ total: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
          .where(and(eq(messages.organizationId, input.organizationId), eq(conversations.channelId, channel.id), eq(messages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date`));
        const reservedDate = getLocalCampaignDateTime(now, channel.dailyLimitTimeZone).date;
        const [reservedMessages] = await transaction.select({ total: count() }).from(outboxEvents)
          .where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending), sql`${outboxEvents.payload}->>'channelId' = ${channel.id}`, sql`${outboxEvents.payload}->>'reservedDate' = ${reservedDate}`));
        const remaining = Math.max(0, channel.dailyMessageLimit - (usedMessages?.total ?? 0) - (reservedMessages?.total ?? 0));
        if (remaining > 0) readyChannels.push({ id: channel.id, displayName: channel.displayName, phoneNumber: channel.phoneNumber, reservedDate, remaining });
      }
      if (openChannelCount === 0) return 'not_ready';
      if (readyChannels.length === 0) return 'quota_exceeded';
      const assignments: Array<{ leadId: string; channelId: string; channelDisplayName: string; channelPhoneNumber: string; reservedDate: string }> = [];
      let channelCursor = 0;
      for (const candidate of candidates) {
        let attempts = 0;
        while (attempts < readyChannels.length && readyChannels[channelCursor % readyChannels.length].remaining <= 0) { channelCursor += 1; attempts += 1; }
        const channel = readyChannels[channelCursor % readyChannels.length];
        if (channel.remaining <= 0) return 'quota_exceeded';
        assignments.push({ leadId: candidate.leadId, channelId: channel.id, channelDisplayName: channel.displayName, channelPhoneNumber: channel.phoneNumber, reservedDate: channel.reservedDate });
        channel.remaining -= 1;
        channelCursor += 1;
      }

      const outboxRows = assignments.map((assignment, index) => ({
        organizationId: input.organizationId,
        eventType: CAMPAIGN_OUTREACH_EVENT,
        aggregateType: CAMPAIGN_AUDIT.entity,
        aggregateId: draft.id,
        idempotencyKey: `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${draft.id}:${assignment.leadId}`,
        payload: { organizationId: input.organizationId, actorUserId: input.actorUserId, campaignDraftId: draft.id, channelId: assignment.channelId, channelDisplayName: assignment.channelDisplayName, channelPhoneNumber: assignment.channelPhoneNumber, leadId: assignment.leadId, reservedDate: assignment.reservedDate },
        availableAt: new Date(now.getTime() + index * draft.minimumDelaySeconds * 1000),
      }));
      await transaction.insert(outboxEvents).values(outboxRows).onConflictDoNothing({ target: [outboxEvents.organizationId, outboxEvents.idempotencyKey] });
      await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.active, updatedAt: now }).where(and(eq(campaignDrafts.id, draft.id), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.started, entityType: CAMPAIGN_AUDIT.entity, entityId: draft.id, correlationId: input.correlationId, afterState: { audienceCount: candidates.length, channelIds: readyChannels.map((channel) => channel.id), assignedByChannel: assignments.reduce<Record<string, number>>((totals, assignment) => ({ ...totals, [assignment.channelId]: (totals[assignment.channelId] ?? 0) + 1 }), {}), openingMessageLength: draft.openingMessage.length } });
      return new CampaignStartResultDto(draft.id, candidates.length, CAMPAIGN_DRAFT_STATUS.active);
    });
  }

  async changeStatus(input: CampaignStatusChangeRepositoryDto): Promise<CampaignStatusChangeDto | 'not_found' | 'invalid_state'> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ id: campaignDrafts.id, status: campaignDrafts.status }).from(campaignDrafts)
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
        .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), campaignLineAccessCondition(input.access))).for('update').limit(1);
      if (!draft) return 'not_found';
      if (draft.status !== input.fromStatus) return 'invalid_state';
      const now = new Date();
      const [updated] = await transaction.update(campaignDrafts).set({ status: input.toStatus, updatedAt: now })
        .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, input.fromStatus)))
        .returning({ id: campaignDrafts.id, status: campaignDrafts.status });
      if (!updated) return 'invalid_state';
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: input.toStatus === CAMPAIGN_DRAFT_STATUS.paused ? 'campaign.paused' : 'campaign.resumed', entityType: CAMPAIGN_AUDIT.entity, entityId: updated.id, correlationId: input.correlationId, beforeState: { status: input.fromStatus }, afterState: { status: updated.status } });
      if (input.toStatus === CAMPAIGN_DRAFT_STATUS.active) {
        await transaction.update(outboxEvents).set({ availableAt: now }).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, updated.id), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending)));
      }
      return new CampaignStatusChangeDto(updated.id, updated.status);
    });
  }

  async prepareNextOutreach(): Promise<{ organizationId: string; actorUserId: string; actorCanManageAllLines: boolean; channelId: string; provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; credentials: { ciphertext: string; iv: string; authTag: string }; recipientPhone: string; bodyText: string; messageId: string; conversationId: string; leadId: string; campaignDraftId: string } | null> {
    return database.transaction(async (transaction) => {
      await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE })
        .where(and(eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.processing), sql`${outboxEvents.availableAt} <= now()`));
      const [event] = await transaction.select({ id: outboxEvents.id, organizationId: outboxEvents.organizationId, payload: outboxEvents.payload })
        .from(outboxEvents).where(and(eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending), sql`${outboxEvents.availableAt} <= now()`))
        .orderBy(outboxEvents.availableAt, outboxEvents.createdAt).for('update', { skipLocked: true }).limit(1);
      if (!event) return null;
      const parsedPayload = campaignOutreachPayloadSchema.safeParse(event.payload);
      if (!parsedPayload.success || parsedPayload.data.organizationId !== event.organizationId) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const { actorUserId, campaignDraftId, channelId, leadId } = parsedPayload.data;
      const [draft] = await transaction.select({ openingMessage: campaignDrafts.openingMessage, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, status: campaignDrafts.status, businessLineId: messagingChannels.businessLineId, businessLineStatus: businessLines.status })
        .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId))).leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
        .where(and(eq(campaignDrafts.id, campaignDraftId), eq(campaignDrafts.organizationId, event.organizationId))).for('update', { of: campaignDrafts }).limit(1);
      if (!draft) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (!draft.businessLineId) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (draft.status === CAMPAIGN_DRAFT_STATUS.paused) {
        await transaction.update(outboxEvents).set({ availableAt: new Date(Date.now() + 60_000) }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (draft.businessLineId && draft.businessLineStatus !== 'active') {
        await transaction.update(outboxEvents).set({ availableAt: new Date(Date.now() + 60_000) }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (draft.status !== CAMPAIGN_DRAFT_STATUS.active) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const [channel] = await transaction.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, operationMode: messagingChannels.operationMode, outboundAssistantProfileId: messagingChannels.outboundAssistantProfileId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, event.organizationId))).for('update').limit(1);
      const [actor] = await transaction.select({ role: authMember.role }).from(authMember)
        .where(and(eq(authMember.organizationId, event.organizationId), eq(authMember.userId, actorUserId))).limit(1);
      const actorCanManageAll = actor ? hasOrganizationRole(actor.role, ORGANIZATION_MANAGEMENT_ROLES) : false;
      const actorHasLineMembership = actorCanManageAll || (await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
        .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
        .where(and(eq(businessLineMembers.organizationId, event.organizationId), eq(businessLineMembers.businessLineId, draft.businessLineId), eq(authMember.userId, actorUserId))).limit(1)).length > 0;
      const actorAuthorized = Boolean(actor && hasOrganizationRole(actor.role, ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES) && actorHasLineMembership);
      const [profile] = channel?.outboundAssistantProfileId ? await transaction.select({ enabled: assistantProfiles.enabled, systemPrompt: assistantProfiles.systemPrompt }).from(assistantProfiles)
        .where(and(eq(assistantProfiles.id, channel.outboundAssistantProfileId), eq(assistantProfiles.organizationId, event.organizationId), eq(assistantProfiles.businessLineId, draft.businessLineId), eq(assistantProfiles.direction, 'outbound'))).limit(1) : [];
      const [agent] = !channel?.outboundAssistantProfileId ? await transaction.select({ enabled: agentSettings.enabled, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, event.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY), or(eq(agentSettings.businessLineId, draft.businessLineId), isNull(agentSettings.businessLineId))))
        .orderBy(desc(sql`(${agentSettings.businessLineId} is not null)`)).limit(1) : [];
      const assistantReady = channel?.outboundAssistantProfileId ? Boolean(profile?.enabled && profile.systemPrompt.trim().length >= 100) : Boolean(agent?.enabled && agent.systemPrompt.trim().length >= 100);
      const externalConversationId = `campaign:${campaignDraftId}:${leadId}`;
      const [candidate] = await transaction.select({ leadId: leads.id, status: leads.status, accountId: leads.accountId, opportunityId: opportunities.id, primaryContactId: leadContacts.personId, phone: people.phone, outreachDecision: leadContacts.outreachDecision, hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, channelId), eq(conversations.personId, leadContacts.personId), sql`${conversations.externalConversationId} <> ${externalConversationId}`, inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}`, campaignConversationReplied: sql<boolean>`${exists(transaction.select({ id: messages.id }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId))).where(and(eq(messages.organizationId, event.organizationId), eq(conversations.externalConversationId, externalConversationId), eq(messages.direction, 'inbound'))))}` })
        .from(leads).leftJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId))).leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.id, leadId), eq(leads.organizationId, event.organizationId), eq(leads.businessLineId, draft.businessLineId), exists(transaction.select({ leadId: campaignDraftAudiences.leadId }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, event.organizationId), eq(campaignDraftAudiences.campaignDraftId, campaignDraftId), eq(campaignDraftAudiences.leadId, leads.id)))))).limit(1);
      if (!draft || !channel?.isActive || channel.operationMode === 'inbound' || channel.businessLineId !== draft.businessLineId || !actorAuthorized || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag || !assistantReady || !candidate || candidate.campaignConversationReplied || audienceBlockers(candidate, true, true).length > 0) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const recipientPhone = candidate.phone;
      const contactId = candidate.primaryContactId;
      if (!recipientPhone || !contactId) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const now = new Date();
      const local = getLocalCampaignDateTime(now, draft.timeZone);
      const channelLocal = getLocalCampaignDateTime(now, channel.dailyLimitTimeZone);
      const channelHours = await transaction.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
        .where(and(eq(channelBusinessHours.organizationId, event.organizationId), eq(channelBusinessHours.channelId, channelId)));
      const channelIsOpen = isWithinBusinessHours({ timeZone: channel.dailyLimitTimeZone, businessHours: channelHours, at: now });
      const [holiday] = await transaction.select({ id: campaignNoSendDates.id }).from(campaignNoSendDates).where(and(eq(campaignNoSendDates.organizationId, event.organizationId), eq(campaignNoSendDates.date, local.date))).limit(1);
      const [used] = await transaction.select({ total: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, event.organizationId), eq(conversations.channelId, channelId), eq(messages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${messages.occurredAt} at time zone ${channel.dailyLimitTimeZone})::date = ${channelLocal.date}`));
      if (!channelIsOpen || local.time < draft.windowStart || local.time >= draft.windowEnd || holiday || (used?.total ?? 0) >= channel.dailyMessageLimit) {
        await transaction.update(outboxEvents).set({ availableAt: new Date(now.getTime() + 5 * 60_000) }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (channel.provider !== 'evolution' && channel.provider !== 'whatsapp_cloud_api') {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      let [conversation] = await transaction.select({ id: conversations.id, channelId: conversations.channelId, personId: conversations.personId }).from(conversations)
        .where(and(eq(conversations.organizationId, event.organizationId), eq(conversations.provider, channel.provider), eq(conversations.externalConversationId, externalConversationId))).for('update').limit(1);
      if (conversation && (conversation.channelId !== channelId || conversation.personId !== contactId)) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const messageIdempotencyKey = `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${campaignDraftId}:${leadId}`;
      const [existingMessage] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, bodyText: messages.bodyText, deliveryState: messages.deliveryState }).from(messages)
        .where(and(eq(messages.organizationId, event.organizationId), eq(messages.idempotencyKey, messageIdempotencyKey), eq(messages.direction, 'outbound'))).for('update').limit(1);
      if (existingMessage && (!conversation || existingMessage.conversationId !== conversation.id || existingMessage.bodyText !== draft.openingMessage || !['requested', 'unknown', 'failed'].includes(existingMessage.deliveryState))) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (!conversation) {
        [conversation] = await transaction.insert(conversations).values({ organizationId: event.organizationId, provider: channel.provider, externalConversationId, channelId, accountId: candidate.accountId, personId: contactId, opportunityId: candidate.opportunityId, status: 'open', automationMode: channel.operationMode === 'outbound' ? 'paused' : 'assistant', lastMessageAt: now })
          .returning({ id: conversations.id, channelId: conversations.channelId, personId: conversations.personId });
      } else {
        await transaction.update(conversations).set({ status: 'open', lastMessageAt: now }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, event.organizationId)));
      }
      if (!conversation) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const [message] = existingMessage
        ? await transaction.update(messages).set({ deliveryState: 'requested', externalMessageId: null, occurredAt: now }).where(and(eq(messages.id, existingMessage.id), eq(messages.organizationId, event.organizationId))).returning({ id: messages.id })
        : await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: conversation.id, direction: 'outbound', actorType: 'assistant', bodyText: draft.openingMessage, deliveryState: 'requested', idempotencyKey: messageIdempotencyKey, occurredAt: now }).returning({ id: messages.id });
      await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.processing, availableAt: new Date(now.getTime() + CAMPAIGN_OUTREACH_LEASE_SECONDS * 1000), attempts: sql`${outboxEvents.attempts}::int + 1`, lastErrorCode: null }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending)));
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: conversation.id, occurredAt: now.toISOString() })})`);
      return { organizationId: event.organizationId, actorUserId, actorCanManageAllLines: actorCanManageAll, channelId, provider: channel.provider, providerChannelId: channel.providerChannelId, credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag }, recipientPhone, bodyText: draft.openingMessage, messageId: message.id, conversationId: conversation.id, leadId, campaignDraftId };
    });
  }

  async finishOutreach(input: { organizationId: string; actorUserId: string; channelId: string; messageId: string; conversationId: string; leadId: string; campaignDraftId: string; deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null }): Promise<void> {
    await database.transaction(async (transaction) => {
      const delivered = input.deliveryState === 'accepted';
      const [finishedEvent] = await transaction.update(outboxEvents).set({ status: delivered ? CAMPAIGN_OUTBOX_STATUS.published : CAMPAIGN_OUTBOX_STATUS.failed, publishedAt: delivered ? new Date() : null, lastErrorCode: delivered ? null : CAMPAIGN_OUTREACH_REVIEW_CODE })
        .where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.idempotencyKey, `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${input.campaignDraftId}:${input.leadId}`), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.processing)))
        .returning({ id: outboxEvents.id });
      if (!finishedEvent) return;
      await transaction.update(messages).set({ deliveryState: delivered ? 'accepted' : input.deliveryState, externalMessageId: input.externalMessageId }).where(and(eq(messages.id, input.messageId), eq(messages.organizationId, input.organizationId)));
      if (delivered) {
        const [updatedLead] = await transaction.update(leads).set({ status: LEAD_STATUS.contacting, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, LEAD_STATUS.ready))).returning({ id: leads.id });
        if (updatedLead) await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: LEAD_STATUS.ready, toStatus: LEAD_STATUS.contacting, changedByUserId: input.actorUserId });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: AUDIT_ACTOR_TYPE.system, action: 'campaign.initial_message_accepted', entityType: CAMPAIGN_AUDIT.entity, entityId: input.campaignDraftId, afterState: { leadId: input.leadId, conversationId: input.conversationId, messageId: input.messageId, channelId: input.channelId } });
        const [remaining] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), inArray(outboxEvents.status, [CAMPAIGN_OUTBOX_STATUS.pending, CAMPAIGN_OUTBOX_STATUS.processing])));
        const [needsReview] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
        if ((remaining?.total ?? 0) === 0 && (needsReview?.total ?? 0) === 0) await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.completed, updatedAt: new Date() }).where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), inArray(campaignDrafts.status, [CAMPAIGN_DRAFT_STATUS.active, CAMPAIGN_DRAFT_STATUS.paused])));
      }
    });
  }

  async operationalSnapshot(input: CampaignOperationalSnapshotRepositoryDto): Promise<CampaignOperationalSnapshotDto | null> {
    const [draft] = await database.select({ channelId: campaignDrafts.channelId, businessLineId: messagingChannels.businessLineId, operationMode: messagingChannels.operationMode, provider: messagingChannels.provider, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, campaignDailyMessageLimit: campaignDrafts.dailyMessageLimit, channelDailyMessageLimit: messagingChannels.dailyMessageLimit, channelDailyMessageCount: sql<number>`(select count(*)::int from ${messages} inner join ${conversations} on ${conversations.id} = ${messages.conversationId} and ${conversations.organizationId} = ${messages.organizationId} where ${messages.organizationId} = ${messagingChannels.organizationId} and ${conversations.channelId} = ${messagingChannels.id} and ${messages.direction} = ${CHANNEL_QUOTA_COUNTED_DIRECTION} and ${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE} and (${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date)`, channelActive: messagingChannels.isActive, channelConfigured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)`, agentReady: sql<boolean>`coalesce((select ${agentSettings.enabled} and length(trim(${agentSettings.systemPrompt})) >= 100 from ${agentSettings} where ${agentSettings.organizationId} = ${campaignDrafts.organizationId} and ${agentSettings.agentKey} = ${SDR_AGENT_KEY} and (${agentSettings.businessLineId} = ${messagingChannels.businessLineId} or ${agentSettings.businessLineId} is null) order by (${agentSettings.businessLineId} is not null) desc limit 1), false)`, openingMessage: campaignDrafts.openingMessage })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft), campaignLineAccessCondition(input.access))).limit(1);
    if (!draft || !draft.businessLineId) return null;
    const [audience] = await database.select({ total: count() }).from(campaignDraftAudiences)
      .innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId)))
      .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), eq(leads.businessLineId, draft.businessLineId)));
    const selected = await this.selectedChannels(new CampaignSelectedChannelsRepositoryDto(input.organizationId, input.campaignDraftId));
    const agentReady = draft.businessLineId ? await this.hasReadyOutboundAssistant(input.organizationId, draft.businessLineId, selected?.map((channel) => channel.id) ?? [], draft.agentReady) : false;
    const channelStats = selected?.length ? await database.select({ id: messagingChannels.id, dailyMessageLimit: messagingChannels.dailyMessageLimit, operationMode: messagingChannels.operationMode, isActive: messagingChannels.isActive, configured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)`, used: sql<number>`(select count(*)::int from ${messages} inner join ${conversations} on ${conversations.id} = ${messages.conversationId} and ${conversations.organizationId} = ${messages.organizationId} where ${messages.organizationId} = ${messagingChannels.organizationId} and ${conversations.channelId} = ${messagingChannels.id} and ${messages.direction} = ${CHANNEL_QUOTA_COUNTED_DIRECTION} and ${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE} and (${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date)`, reserved: sql<number>`(select count(*)::int from ${outboxEvents} where ${outboxEvents.organizationId} = ${messagingChannels.organizationId} and ${outboxEvents.eventType} = ${CAMPAIGN_OUTREACH_EVENT} and ${outboxEvents.status} = ${CAMPAIGN_OUTBOX_STATUS.pending} and ${outboxEvents.payload}->>'channelId' = ${messagingChannels.id} and ${outboxEvents.payload}->>'reservedDate' = to_char(now() at time zone ${messagingChannels.dailyLimitTimeZone}, 'YYYY-MM-DD'))` }).from(messagingChannels)
      .where(and(eq(messagingChannels.organizationId, input.organizationId), inArray(messagingChannels.id, selected.map((channel) => channel.id)))) : [];
    const holidays = await database.select({ date: campaignNoSendDates.date, name: campaignNoSendDates.name }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, input.organizationId)).orderBy(campaignNoSendDates.date);
    const quotaChannels = channelStats.filter((channel) => channel.isActive && channel.configured && channel.operationMode !== 'inbound');
    return new CampaignOperationalSnapshotDto(draft.channelId, channelProviderSchema.parse(draft.provider), audience?.total ?? 0, channelStats.some((channel) => channel.isActive && channel.operationMode !== 'inbound'), quotaChannels.length > 0, agentReady, draft.windowStart, draft.windowEnd, draft.timeZone, draft.campaignDailyMessageLimit, quotaChannels.reduce((total, channel) => total + channel.dailyMessageLimit, 0), quotaChannels.reduce((total, channel) => total + channel.used, 0), draft.openingMessage, holidays, quotaChannels.map((channel) => new CampaignChannelQuotaSnapshotDto(channel.id, channel.dailyMessageLimit, channel.used, channel.reserved)));
  }

  async listNoSendDates(organizationId: string): Promise<CampaignNoSendDateDto[]> {
    const rows = await database.select({ id: campaignNoSendDates.id, date: campaignNoSendDates.date, name: campaignNoSendDates.name }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, organizationId)).orderBy(campaignNoSendDates.date, campaignNoSendDates.id).limit(CAMPAIGN_NO_SEND_DATE_LIMITS.maxDates);
    return rows.map((row) => new CampaignNoSendDateDto(row.id, row.date, row.name));
  }

  async createNoSendDate(input: CampaignNoSendDateMutationRepositoryDto): Promise<CampaignNoSendDateDto | 'duplicate' | 'limit_reached'> {
    return database.transaction(async (transaction) => {
      const [organization] = await transaction.select({ id: authOrganization.id }).from(authOrganization).where(eq(authOrganization.id, input.organizationId)).for('update').limit(1);
      if (!organization) return 'limit_reached';
      const [total] = await transaction.select({ value: count() }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, input.organizationId));
      if ((total?.value ?? 0) >= CAMPAIGN_NO_SEND_DATE_LIMITS.maxDates) return 'limit_reached';
      const [row] = await transaction.insert(campaignNoSendDates).values({ organizationId: input.organizationId, date: input.input.date, name: input.input.name, createdByUserId: input.actorUserId }).onConflictDoNothing({ target: [campaignNoSendDates.organizationId, campaignNoSendDates.date] }).returning({ id: campaignNoSendDates.id, date: campaignNoSendDates.date, name: campaignNoSendDates.name });
      if (!row) return 'duplicate';
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_NO_SEND_DATE_AUDIT.created, entityType: CAMPAIGN_NO_SEND_DATE_AUDIT.entity, entityId: row.id, correlationId: input.correlationId, afterState: { date: row.date, name: row.name } });
      return new CampaignNoSendDateDto(row.id, row.date, row.name);
    });
  }

  async importNationalHolidays(organizationId: string, actorUserId: string, correlationId: string | null): Promise<CampaignNoSendDateDto[] | 'limit_reached'> {
    return database.transaction(async (transaction) => {
      const [organization] = await transaction.select({ id: authOrganization.id }).from(authOrganization).where(eq(authOrganization.id, organizationId)).for('update').limit(1);
      if (!organization) return 'limit_reached';
      const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const today = `${todayParts.find((part) => part.type === 'year')?.value}-${todayParts.find((part) => part.type === 'month')?.value}-${todayParts.find((part) => part.type === 'day')?.value}`;
      const existing = await transaction.select({ date: campaignNoSendDates.date }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, organizationId));
      const existingDates = new Set(existing.map((row) => row.date));
      const candidates = CAMPAIGN_NATIONAL_HOLIDAY_PRESETS.filter((item) => item.date >= today && !existingDates.has(item.date));
      const remaining = Math.max(0, CAMPAIGN_NO_SEND_DATE_LIMITS.maxDates - existing.length);
      if (candidates.length > remaining) return 'limit_reached';
      const rowsToInsert = candidates.slice(0, remaining).map((item) => ({ organizationId, date: item.date, name: item.name, createdByUserId: actorUserId }));
      if (rowsToInsert.length > 0) {
        const inserted = await transaction.insert(campaignNoSendDates).values(rowsToInsert).onConflictDoNothing({ target: [campaignNoSendDates.organizationId, campaignNoSendDates.date] }).returning({ id: campaignNoSendDates.id, date: campaignNoSendDates.date, name: campaignNoSendDates.name });
        if (inserted.length > 0) await transaction.insert(auditEvents).values(inserted.map((row) => ({ organizationId, actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_NO_SEND_DATE_AUDIT.created, entityType: CAMPAIGN_NO_SEND_DATE_AUDIT.entity, entityId: row.id, correlationId, afterState: { date: row.date, name: row.name, source: CAMPAIGN_NO_SEND_DATE_SOURCE.nationalPreset } })));
      }
      const rows = await transaction.select({ id: campaignNoSendDates.id, date: campaignNoSendDates.date, name: campaignNoSendDates.name }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, organizationId)).orderBy(campaignNoSendDates.date, campaignNoSendDates.id).limit(CAMPAIGN_NO_SEND_DATE_LIMITS.maxDates);
      return rows.map((row) => new CampaignNoSendDateDto(row.id, row.date, row.name));
    });
  }

  async deleteNoSendDate(input: CampaignNoSendDateDeleteRepositoryDto): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [row] = await transaction.select().from(campaignNoSendDates).where(and(eq(campaignNoSendDates.id, input.id), eq(campaignNoSendDates.organizationId, input.organizationId))).for('update').limit(1);
      if (!row) return false;
      await transaction.delete(campaignNoSendDates).where(and(eq(campaignNoSendDates.id, input.id), eq(campaignNoSendDates.organizationId, input.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_NO_SEND_DATE_AUDIT.deleted, entityType: CAMPAIGN_NO_SEND_DATE_AUDIT.entity, entityId: row.id, correlationId: input.correlationId, beforeState: { date: row.date, name: row.name } });
      return true;
    });
  }

  async list(input: CampaignDraftListRepositoryDto): Promise<CampaignDraftPageDto> {
    const { organizationId } = input;
    const { limit, offset } = input.query;
    const lineAccess = campaignLineAccessCondition(input.access);
    const visibleCampaigns = and(eq(campaignDrafts.organizationId, organizationId), lineAccess);
    const [rows, [totalRow]] = await Promise.all([database.select({ id: campaignDrafts.id, name: campaignDrafts.name, openingMessage: campaignDrafts.openingMessage, channelId: campaignDrafts.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, dailyMessageLimit: campaignDrafts.dailyMessageLimit, minimumDelaySeconds: campaignDrafts.minimumDelaySeconds, status: campaignDrafts.status, createdAt: campaignDrafts.createdAt })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(visibleCampaigns).orderBy(desc(campaignDrafts.createdAt), desc(campaignDrafts.id)).limit(limit + 1).offset(offset),
      database.select({ total: count() }).from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId))).where(visibleCampaigns),
    ]);
    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const audienceCounts = pageRows.length === 0 ? [] : await database.select({ campaignDraftId: campaignDraftAudiences.campaignDraftId, total: count() }).from(campaignDraftAudiences)
      .innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId)))
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.id, campaignDraftAudiences.campaignDraftId), eq(campaignDrafts.organizationId, campaignDraftAudiences.organizationId)))
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDraftAudiences.organizationId, organizationId), inArray(campaignDraftAudiences.campaignDraftId, pageRows.map((row) => row.id)), eq(leads.businessLineId, messagingChannels.businessLineId))).groupBy(campaignDraftAudiences.campaignDraftId);
    const audienceCountByDraft = new Map(audienceCounts.map((row) => [row.campaignDraftId, row.total]));
    const linkedChannels = pageRows.length === 0 ? [] : await database.select({ campaignDraftId: campaignDraftChannels.campaignDraftId, channelId: campaignDraftChannels.channelId, displayName: messagingChannels.displayName, phoneNumber: messagingChannels.phoneNumber })
      .from(campaignDraftChannels).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDraftChannels.channelId), eq(messagingChannels.organizationId, campaignDraftChannels.organizationId)))
      .where(and(eq(campaignDraftChannels.organizationId, organizationId), inArray(campaignDraftChannels.campaignDraftId, pageRows.map((row) => row.id)))).orderBy(campaignDraftChannels.position);
    const channelsByDraft = new Map<string, typeof linkedChannels>();
    for (const channel of linkedChannels) channelsByDraft.set(channel.campaignDraftId, [...(channelsByDraft.get(channel.campaignDraftId) ?? []), channel]);
    const data = pageRows.map((row) => {
      const selected = channelsByDraft.get(row.id) ?? [{ campaignDraftId: row.id, channelId: row.channelId, displayName: row.channelName, phoneNumber: row.channelPhoneNumber }];
      return new CampaignDraftDto(row.id, row.name, row.openingMessage, row.channelId, row.channelName, row.channelPhoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, audienceCountByDraft.get(row.id) ?? 0, row.createdAt.toISOString(), selected.map((channel) => channel.channelId), selected.map((channel) => `${channel.displayName} · ${channel.phoneNumber}`));
    });
    return new CampaignDraftPageDto(data, { limit, offset, total: totalRow?.total ?? 0, hasNextPage });
  }

  async getAudiencePreview(input: CampaignAudiencePreviewRepositoryDto): Promise<CampaignAudiencePreviewDto | null> {
      const [draft] = await database.select({ channelId: campaignDrafts.channelId, businessLineId: messagingChannels.businessLineId }).from(campaignDrafts)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft), campaignLineAccessCondition(input.access))).limit(1);
    if (!draft || !draft.businessLineId) return null;
    const selectedChannels = await this.selectedChannels(new CampaignSelectedChannelsRepositoryDto(input.organizationId, input.campaignDraftId));
    const conditions = [eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, draft.businessLineId)];
    const accessCondition = campaignLeadAccessCondition(input.access);
    if (accessCondition) conditions.push(accessCondition);
    const [rows, [countRow], [agent], selectedRows] = await Promise.all([
      database.select({ leadId: leads.id, accountName: accounts.name, source: leads.source, status: leads.status, contactName: people.name, phone: people.phone, primaryContactId: leadContacts.id, outreachDecision: leadContacts.outreachDecision,
        hasConversation: sql<boolean>`${exists(database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}`,
      }).from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
        .where(and(...conditions)).orderBy(desc(leads.createdAt), desc(leads.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(leads).where(and(...conditions)),
      database.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) >= 100` }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY), or(eq(agentSettings.businessLineId, draft.businessLineId), isNull(agentSettings.businessLineId)))).orderBy(desc(sql`(${agentSettings.businessLineId} is not null)`)).limit(1),
      database.select({ leadId: campaignDraftAudiences.leadId }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), eq(leads.businessLineId, draft.businessLineId), campaignLeadAccessCondition(input.access))),
    ]);
    const selectedLeadIds = selectedRows.map((row) => row.leadId);
    const selectedSet = new Set(selectedLeadIds);
    const channelReady = Boolean(selectedChannels?.some((channel) => channel.active && channel.configured && channel.operationMode !== 'inbound'));
    const agentReady = await this.hasReadyOutboundAssistant(input.organizationId, draft.businessLineId, selectedChannels?.filter((channel) => channel.active && channel.configured && channel.operationMode !== 'inbound').map((channel) => channel.id) ?? [], Boolean(agent?.enabled && agent.hasPrompt));
    const audience = rows.map((lead) => {
      const blockers = audienceBlockers(lead, channelReady, agentReady);
      return new CampaignAudienceLeadDto(lead.leadId, lead.accountName, lead.contactName, lead.phone, lead.status, lead.source, blockers, selectedSet.has(lead.leadId));
    });
    const eligible = audience.filter((lead) => lead.blockers.length === 0).length;
    const total = countRow?.total ?? 0;
    const [{ total: allSelectedCount }] = await database.select({ total: count() }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), eq(leads.businessLineId, draft.businessLineId)));
    return new CampaignAudiencePreviewDto(audience, { eligible, excluded: audience.length - eligible }, selectedLeadIds, (allSelectedCount ?? 0) - selectedLeadIds.length, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + rows.length < total });
  }

  async saveAudience(input: CampaignAudienceSaveRepositoryDto): Promise<CampaignAudienceSaveDto | null> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ channelId: campaignDrafts.channelId, businessLineId: messagingChannels.businessLineId }).from(campaignDrafts)
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
        .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft), campaignLineAccessCondition(input.access))).for('update').limit(1);
      if (!draft || !draft.businessLineId) return null;
      const linkedChannels = await transaction.select({ channelId: campaignDraftChannels.channelId }).from(campaignDraftChannels).where(and(eq(campaignDraftChannels.organizationId, input.organizationId), eq(campaignDraftChannels.campaignDraftId, input.campaignDraftId)));
      const channelIds = linkedChannels.length ? linkedChannels.map((channel) => channel.channelId) : [draft.channelId];
      const eligibleChannels = await transaction.select({ id: messagingChannels.id, outboundAssistantProfileId: messagingChannels.outboundAssistantProfileId, operationMode: messagingChannels.operationMode }).from(messagingChannels)
        .where(and(inArray(messagingChannels.id, channelIds), eq(messagingChannels.organizationId, input.organizationId), campaignLineAccessCondition(input.access), eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`));
      const channelReady = eligibleChannels.some((channel) => channel.operationMode !== 'inbound');
      const [agent] = await transaction.select({ enabled: agentSettings.enabled, hasPrompt: sql<boolean>`length(trim(${agentSettings.systemPrompt})) >= 100` }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY), or(eq(agentSettings.businessLineId, draft.businessLineId), isNull(agentSettings.businessLineId)))).orderBy(desc(sql`(${agentSettings.businessLineId} is not null)`)).limit(1);
      const profileIds = eligibleChannels.flatMap((channel) => channel.outboundAssistantProfileId ? [channel.outboundAssistantProfileId] : []);
      const readyProfiles = profileIds.length ? await transaction.select({ id: assistantProfiles.id }).from(assistantProfiles)
        .where(and(eq(assistantProfiles.organizationId, input.organizationId), eq(assistantProfiles.businessLineId, draft.businessLineId), eq(assistantProfiles.direction, 'outbound'), eq(assistantProfiles.enabled, true), sql`length(trim(${assistantProfiles.systemPrompt})) >= 100`, inArray(assistantProfiles.id, profileIds))) : [];
      const readyProfileIds = new Set(readyProfiles.map((profile) => profile.id));
      const legacyAgentReady = Boolean(agent?.enabled && agent.hasPrompt);
      const agentReady = eligibleChannels.some((channel) => channel.operationMode !== 'inbound' && (channel.outboundAssistantProfileId ? readyProfileIds.has(channel.outboundAssistantProfileId) : legacyAgentReady));
      const conditions = [eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, draft.businessLineId), inArray(leads.id, input.input.leadIds)];
      const accessCondition = campaignLeadAccessCondition(input.access);
      if (accessCondition) conditions.push(accessCondition);
      const candidates = input.input.leadIds.length === 0 ? [] : await transaction.select({ leadId: leads.id, status: leads.status, primaryContactId: leadContacts.id, phone: people.phone, outreachDecision: leadContacts.outreachDecision,
        hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}`,
      }).from(leads).leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId))).where(and(...conditions));
      if (candidates.length !== input.input.leadIds.length || candidates.some((lead) => audienceBlockers(lead, channelReady, agentReady).length > 0)) {
        throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.audienceIneligible, message: 'One or more selected leads are no longer eligible. Refresh the preview and review the exclusions.' });
      }
      const previousRows = await transaction.select({ leadId: campaignDraftAudiences.leadId, selectedByUserId: campaignDraftAudiences.selectedByUserId, createdAt: campaignDraftAudiences.createdAt }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
      const [lineLeadRows, visibleLeadRows] = previousRows.length === 0 ? [[], []] : await Promise.all([
        transaction.select({ leadId: leads.id }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), eq(leads.businessLineId, draft.businessLineId))),
        transaction.select({ leadId: leads.id }).from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId))).where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId), eq(leads.businessLineId, draft.businessLineId), campaignLeadAccessCondition(input.access))),
      ]);
      const visibleLeadIds = new Set(visibleLeadRows.map((row) => row.leadId));
      const lineLeadIds = new Set(lineLeadRows.map((row) => row.leadId));
      const preservedRows = previousRows.filter((row) => lineLeadIds.has(row.leadId) && !visibleLeadIds.has(row.leadId));
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

  async create(input: CampaignDraftCreateRepositoryDto): Promise<CampaignDraftDto | null | 'cross_line_channels'> {
    return database.transaction(async (transaction) => {
      const requestedChannelIds = input.input.channelIds ?? [input.input.channelId];
      const channels = await transaction.select({ id: messagingChannels.id, businessLineId: messagingChannels.businessLineId, displayName: messagingChannels.displayName, phoneNumber: messagingChannels.phoneNumber, operationMode: messagingChannels.operationMode }).from(messagingChannels)
        .where(and(inArray(messagingChannels.id, requestedChannelIds), eq(messagingChannels.organizationId, input.organizationId), campaignLineAccessCondition(input.access), eq(messagingChannels.isActive, true), sql`${messagingChannels.credentialsCiphertext} is not null`, sql`${messagingChannels.credentialsIv} is not null`, sql`${messagingChannels.credentialsAuthTag} is not null`));
      if (channels.length !== requestedChannelIds.length || channels.some((channel) => channel.operationMode === 'inbound')) return null;
      const primary = channels.find((channel) => channel.id === input.input.channelId);
      if (!primary) return null;
      if (channels.some((channel) => channel.businessLineId !== primary.businessLineId)) return 'cross_line_channels';
      try {
        const [row] = await transaction.insert(campaignDrafts).values({ organizationId: input.organizationId, channelId: primary.id, name: input.input.name, openingMessage: input.input.openingMessage, windowStart: input.input.windowStart, windowEnd: input.input.windowEnd, timeZone: input.input.timeZone, dailyMessageLimit: input.input.dailyMessageLimit, minimumDelaySeconds: input.input.minimumDelaySeconds, status: CAMPAIGN_DRAFT_STATUS.draft, createdByUserId: input.userId }).returning();
        await transaction.insert(campaignDraftChannels).values(requestedChannelIds.map((channelId, position) => ({ organizationId: input.organizationId, campaignDraftId: row.id, channelId, position })));
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.created, entityType: CAMPAIGN_AUDIT.entity, entityId: row.id, correlationId: input.correlationId, afterState: { name: row.name, channelId: primary.id, channelIds: requestedChannelIds, windowStart: row.windowStart, windowEnd: row.windowEnd, timeZone: row.timeZone, dailyMessageLimit: row.dailyMessageLimit, minimumDelaySeconds: row.minimumDelaySeconds, status: row.status } });
        return new CampaignDraftDto(row.id, row.name, row.openingMessage, primary.id, primary.displayName, primary.phoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, 0, row.createdAt.toISOString(), requestedChannelIds, requestedChannelIds.map((id) => { const channel = channels.find((item) => item.id === id); return channel ? `${channel.displayName} · ${channel.phoneNumber}` : ''; }));
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === DATABASE_FOREIGN_KEY_VIOLATION_CODE) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.channelInvalid, message: 'The selected channel is no longer available.' });
        throw error;
      }
    });
  }
}
