import { ConflictException, Injectable } from '@nestjs/common';
import { and, count, desc, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, agentSettings, auditEvents, campaignDraftAudiences, campaignDrafts, channelBusinessHours, conversations, leadContacts, leadStatusHistory, leads, messages, messagingChannels, opportunities, people, outboxEvents } from '../db/schema';
import { AUDIT_ACTOR_TYPE } from '../auth/authorization.constants';
import { CONTACT_OUTREACH_DECISION, LEAD_STATUS, SDR_ACTIVE_CONVERSATION_STATUSES, SDR_AGENT_KEY, SDR_READINESS_BLOCKER, SDR_READINESS_BLOCKERS } from '../leads/constants';
import { CAMPAIGN_AUDIENCE_AUDIT_ACTION, CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIT, CAMPAIGN_DRAFT_STATUS, CAMPAIGN_ERROR_CODE, CAMPAIGN_OUTBOX_STATUS, CAMPAIGN_OUTREACH_EVENT, CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX, CAMPAIGN_OUTREACH_REVIEW_CODE, DATABASE_FOREIGN_KEY_VIOLATION_CODE } from './campaigns.constants';
import { CampaignAudienceLeadDto, CampaignAudiencePreviewDto, CampaignAudiencePreviewRepositoryDto, CampaignAudienceSaveDto, CampaignAudienceSaveRepositoryDto, CampaignDeliveryConfirmDto, CampaignDeliveryConfirmRepositoryDto, CampaignDeliveryReviewItemDto, CampaignDeliveryReviewPageDto, CampaignDeliveryReviewRepositoryDto, CampaignDraftCreateRepositoryDto, CampaignDraftDto, CampaignDraftListRepositoryDto, CampaignDraftPageDto, CampaignOperationalSnapshotDto, CampaignOperationalSnapshotRepositoryDto, CampaignStartRepositoryDto, CampaignStartResultDto, CampaignStatusChangeDto, CampaignStatusChangeRepositoryDto } from './campaigns.dto';
import type { LeadRepositoryAccessDto } from '../leads/leads.dto';
import type { SQL } from 'drizzle-orm';
import { CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE } from '../channels/channels.constants';
import { isWithinBusinessHours } from '../channels/channel-assistant-schedule';
import { organization as authOrganization } from '../db/auth-schema';
import { CAMPAIGN_NATIONAL_HOLIDAY_PRESETS, CAMPAIGN_NO_SEND_DATE_AUDIT, CAMPAIGN_NO_SEND_DATE_LIMITS, CAMPAIGN_NO_SEND_DATE_SOURCE } from './campaigns.constants';
import { CampaignNoSendDateDeleteRepositoryDto, CampaignNoSendDateDto, CampaignNoSendDateMutationRepositoryDto } from './campaigns.dto';
import { campaignNoSendDates } from '../db/schema';
import { z } from 'zod';
import { channelProviderSchema } from '../channels/channels.dto';

const campaignDeliveryConfirmationPayloadSchema = z.object({ campaignDraftId: z.string().min(1), leadId: z.string().min(1) });
const campaignOutreachPayloadSchema = z.object({ organizationId: z.string().min(1), actorUserId: z.string().min(1), campaignDraftId: z.string().min(1), channelId: z.string().min(1), leadId: z.string().min(1) });

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

function getLocalCampaignDateTime(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

@Injectable()
export class CampaignsRepository {
  async listDeliveryReview(input: CampaignDeliveryReviewRepositoryDto): Promise<CampaignDeliveryReviewPageDto> {
    const where = and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed), eq(outboxEvents.lastErrorCode, CAMPAIGN_OUTREACH_REVIEW_CODE));
    const [summary] = await database.select({ total: count() }).from(outboxEvents).where(where);
    const rows = await database.select({ outboxEventId: outboxEvents.id, campaignDraftId: campaignDrafts.id, campaignName: campaignDrafts.name, leadId: leads.id, accountName: accounts.name, contactName: people.name, phone: people.phone, deliveryState: messages.deliveryState, lastErrorCode: outboxEvents.lastErrorCode, attempts: outboxEvents.attempts, createdAt: outboxEvents.createdAt })
      .from(outboxEvents)
      .innerJoin(campaignDrafts, and(eq(campaignDrafts.id, outboxEvents.aggregateId), eq(campaignDrafts.organizationId, outboxEvents.organizationId)))
      .leftJoin(leads, and(sql`${leads.id}::text = ${outboxEvents.payload}->>'leadId'`, eq(leads.organizationId, outboxEvents.organizationId)))
      .leftJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
      .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
      .leftJoin(messages, and(eq(messages.organizationId, outboxEvents.organizationId), sql`${messages.idempotencyKey} = ${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX} || ${campaignDrafts.id}::text || ':' || ${leads.id}::text`))
      .where(where).orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id)).limit(input.limit).offset(input.offset);
    const total = summary?.total ?? 0;
    return new CampaignDeliveryReviewPageDto(rows.map((row) => new CampaignDeliveryReviewItemDto(row.outboxEventId, row.campaignDraftId, row.campaignName, row.leadId ?? '', row.accountName ?? '', row.contactName, row.phone, row.deliveryState, row.lastErrorCode, Number(row.attempts), row.createdAt.toISOString())), { limit: input.limit, offset: input.offset, total, hasNextPage: input.offset + rows.length < total });
  }

  async confirmDelivery(input: CampaignDeliveryConfirmRepositoryDto): Promise<CampaignDeliveryConfirmDto | null> {
    return database.transaction(async (transaction) => {
      const [event] = await transaction.select({ id: outboxEvents.id, aggregateId: outboxEvents.aggregateId, payload: outboxEvents.payload })
        .from(outboxEvents).where(and(eq(outboxEvents.id, input.outboxEventId), eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed), eq(outboxEvents.lastErrorCode, CAMPAIGN_OUTREACH_REVIEW_CODE))).for('update').limit(1);
      if (!event) return null;
      const parsedPayload = campaignDeliveryConfirmationPayloadSchema.safeParse(event.payload);
      if (!parsedPayload.success || parsedPayload.data.campaignDraftId !== event.aggregateId) return null;
      const payload = parsedPayload.data;
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
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: 'campaign.delivery_confirmed_sent', entityType: CAMPAIGN_AUDIT.entity, entityId: event.aggregateId, correlationId: input.correlationId, beforeState: { deliveryState: message.deliveryState }, afterState: { outboxEventId: event.id, leadId: payload.leadId, messageId: message.id, conversationId: message.conversationId, deliveryState: confirmedDeliveryState } });
      const [remaining] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, event.aggregateId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending)));
      const [needsReview] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, event.aggregateId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
      if ((remaining?.total ?? 0) === 0 && (needsReview?.total ?? 0) === 0) await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.completed, updatedAt: now }).where(and(eq(campaignDrafts.id, event.aggregateId), eq(campaignDrafts.organizationId, input.organizationId), inArray(campaignDrafts.status, [CAMPAIGN_DRAFT_STATUS.active, CAMPAIGN_DRAFT_STATUS.paused])));
      return new CampaignDeliveryConfirmDto(event.id, CAMPAIGN_OUTBOX_STATUS.published);
    });
  }

  async start(input: CampaignStartRepositoryDto): Promise<CampaignStartResultDto | 'not_found' | 'already_started' | 'not_ready' | 'ineligible' | 'quota_exceeded'> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ id: campaignDrafts.id, channelId: campaignDrafts.channelId, name: campaignDrafts.name, openingMessage: campaignDrafts.openingMessage, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, dailyMessageLimit: campaignDrafts.dailyMessageLimit, minimumDelaySeconds: campaignDrafts.minimumDelaySeconds, status: campaignDrafts.status })
        .from(campaignDrafts).where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId))).for('update').limit(1);
      if (!draft) return 'not_found';
      if (draft.status !== CAMPAIGN_DRAFT_STATUS.draft) return 'already_started';

      const [channel] = await transaction.select({ id: messagingChannels.id, operationMode: messagingChannels.operationMode, isActive: messagingChannels.isActive, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).where(and(eq(messagingChannels.id, draft.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('update').limit(1);
      if (!channel?.isActive || channel.operationMode === 'inbound' || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) return 'not_ready';
      const [agent] = await transaction.select({ enabled: agentSettings.enabled, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1);
      if (!agent?.enabled || !agent.systemPrompt.trim()) return 'not_ready';

      const [audienceCount] = await transaction.select({ total: count() }).from(campaignDraftAudiences)
        .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, draft.id)));
      if (!audienceCount?.total || audienceCount.total > CAMPAIGN_AUDIENCE_MAX_LEADS) return 'ineligible';

      const candidates = await transaction.select({ leadId: leads.id, status: leads.status, accountId: leads.accountId, accountName: accounts.name, primaryContactId: leadContacts.personId, personName: people.name, phone: people.phone, outreachDecision: leadContacts.outreachDecision, hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.channelId, draft.channelId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}` })
        .from(campaignDraftAudiences).innerJoin(leads, and(eq(leads.id, campaignDraftAudiences.leadId), eq(leads.organizationId, campaignDraftAudiences.organizationId)))
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .leftJoin(leadContacts, and(eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.organizationId, leadContacts.organizationId), eq(people.id, leadContacts.personId)))
        .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, draft.id)));
      if (candidates.length !== audienceCount.total || candidates.some((candidate) => audienceBlockers(candidate, true, true).length > 0)) return 'ineligible';

      const now = new Date();
      const local = getLocalCampaignDateTime(now, draft.timeZone);
      const channelHours = await transaction.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
        .where(and(eq(channelBusinessHours.organizationId, input.organizationId), eq(channelBusinessHours.channelId, channel.id)));
      const channelIsOpen = isWithinBusinessHours({ timeZone: channel.dailyLimitTimeZone, businessHours: channelHours, at: now });
      const [holiday] = await transaction.select({ id: campaignNoSendDates.id }).from(campaignNoSendDates).where(and(eq(campaignNoSendDates.organizationId, input.organizationId), eq(campaignNoSendDates.date, local.date))).limit(1);
      if (!channelIsOpen || local.time < draft.windowStart || local.time >= draft.windowEnd || holiday) return 'not_ready';

      const [usedMessages] = await transaction.select({ total: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, input.organizationId), eq(conversations.channelId, channel.id), eq(messages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date`));
      const channelLocalDate = getLocalCampaignDateTime(now, channel.dailyLimitTimeZone).date;
      const [reservedMessages] = await transaction.select({ total: count() }).from(outboxEvents)
        .where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending), sql`${outboxEvents.payload}->>'channelId' = ${channel.id}`, sql`${outboxEvents.payload}->>'reservedDate' = ${channelLocalDate}`));
      const availableQuota = Math.max(0, Math.min(channel.dailyMessageLimit, draft.dailyMessageLimit) - (usedMessages?.total ?? 0) - (reservedMessages?.total ?? 0));
      if (audienceCount.total > availableQuota) return 'quota_exceeded';

      const outboxRows = candidates.map((candidate, index) => ({
        organizationId: input.organizationId,
        eventType: CAMPAIGN_OUTREACH_EVENT,
        aggregateType: CAMPAIGN_AUDIT.entity,
        aggregateId: draft.id,
        idempotencyKey: `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${draft.id}:${candidate.leadId}`,
        payload: { organizationId: input.organizationId, actorUserId: input.actorUserId, campaignDraftId: draft.id, channelId: channel.id, leadId: candidate.leadId, reservedDate: channelLocalDate },
        availableAt: new Date(now.getTime() + index * draft.minimumDelaySeconds * 1000),
      }));
      await transaction.insert(outboxEvents).values(outboxRows).onConflictDoNothing({ target: [outboxEvents.organizationId, outboxEvents.idempotencyKey] });
      await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.active, updatedAt: now }).where(and(eq(campaignDrafts.id, draft.id), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.started, entityType: CAMPAIGN_AUDIT.entity, entityId: draft.id, correlationId: input.correlationId, afterState: { audienceCount: candidates.length, channelId: channel.id, reservedDate: channelLocalDate, openingMessageLength: draft.openingMessage.length } });
      return new CampaignStartResultDto(draft.id, candidates.length, CAMPAIGN_DRAFT_STATUS.active);
    });
  }

  async changeStatus(input: CampaignStatusChangeRepositoryDto): Promise<CampaignStatusChangeDto | 'not_found' | 'invalid_state'> {
    return database.transaction(async (transaction) => {
      const [draft] = await transaction.select({ id: campaignDrafts.id, status: campaignDrafts.status }).from(campaignDrafts)
        .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId))).for('update').limit(1);
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

  async prepareNextOutreach(): Promise<{ organizationId: string; actorUserId: string; channelId: string; provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; credentials: { ciphertext: string; iv: string; authTag: string }; recipientPhone: string; bodyText: string; messageId: string; conversationId: string; leadId: string; campaignDraftId: string } | null> {
    return database.transaction(async (transaction) => {
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
      const [draft] = await transaction.select({ openingMessage: campaignDrafts.openingMessage, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, status: campaignDrafts.status })
        .from(campaignDrafts).where(and(eq(campaignDrafts.id, campaignDraftId), eq(campaignDrafts.organizationId, event.organizationId))).for('update').limit(1);
      if (!draft) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (draft.status === CAMPAIGN_DRAFT_STATUS.paused) {
        await transaction.update(outboxEvents).set({ availableAt: new Date(Date.now() + 60_000) }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      if (draft.status !== CAMPAIGN_DRAFT_STATUS.active) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const [channel] = await transaction.select({ id: messagingChannels.id, operationMode: messagingChannels.operationMode, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, isActive: messagingChannels.isActive, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
        .from(messagingChannels).where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, event.organizationId))).for('update').limit(1);
      const [agent] = await transaction.select({ enabled: agentSettings.enabled, systemPrompt: agentSettings.systemPrompt }).from(agentSettings)
        .where(and(eq(agentSettings.organizationId, event.organizationId), eq(agentSettings.agentKey, SDR_AGENT_KEY))).limit(1);
      const [candidate] = await transaction.select({ leadId: leads.id, status: leads.status, accountId: leads.accountId, opportunityId: opportunities.id, primaryContactId: leadContacts.personId, phone: people.phone, outreachDecision: leadContacts.outreachDecision, hasConversation: sql<boolean>`${exists(transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.organizationId, event.organizationId), eq(conversations.channelId, channelId), eq(conversations.personId, leadContacts.personId), inArray(conversations.status, SDR_ACTIVE_CONVERSATION_STATUSES))))}` })
        .from(leads).leftJoin(opportunities, and(eq(opportunities.leadId, leads.id), eq(opportunities.organizationId, leads.organizationId))).leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId), eq(leadContacts.isPrimary, true)))
        .leftJoin(people, and(eq(people.id, leadContacts.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.id, leadId), eq(leads.organizationId, event.organizationId), exists(transaction.select({ leadId: campaignDraftAudiences.leadId }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, event.organizationId), eq(campaignDraftAudiences.campaignDraftId, campaignDraftId), eq(campaignDraftAudiences.leadId, leads.id)))))).limit(1);
      if (!draft || !channel?.isActive || channel.operationMode === 'inbound' || !channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag || !agent?.enabled || !agent.systemPrompt.trim() || !candidate || audienceBlockers(candidate, true, true).length > 0) {
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
      const externalConversationId = `campaign:${campaignDraftId}:${leadId}`;
      const [conversation] = await transaction.insert(conversations).values({ organizationId: event.organizationId, provider: channel.provider, externalConversationId, channelId, accountId: candidate.accountId, personId: contactId, opportunityId: candidate.opportunityId, status: 'open', automationMode: channel.operationMode === 'outbound' ? 'paused' : 'assistant', lastMessageAt: now })
        .onConflictDoNothing({ target: [conversations.organizationId, conversations.provider, conversations.externalConversationId] }).returning({ id: conversations.id });
      if (!conversation) {
        await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
        return null;
      }
      const messageIdempotencyKey = `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${campaignDraftId}:${leadId}`;
      const [message] = await transaction.insert(messages).values({ organizationId: event.organizationId, conversationId: conversation.id, direction: 'outbound', actorType: 'assistant', bodyText: draft.openingMessage, deliveryState: 'requested', idempotencyKey: messageIdempotencyKey, occurredAt: now }).returning({ id: messages.id });
      await transaction.update(outboxEvents).set({ status: CAMPAIGN_OUTBOX_STATUS.failed, attempts: sql`${outboxEvents.attempts}::int + 1`, lastErrorCode: CAMPAIGN_OUTREACH_REVIEW_CODE }).where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.organizationId, event.organizationId)));
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: event.organizationId, conversationId: conversation.id, occurredAt: now.toISOString() })})`);
      return { organizationId: event.organizationId, actorUserId, channelId, provider: channel.provider, providerChannelId: channel.providerChannelId, credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag }, recipientPhone, bodyText: draft.openingMessage, messageId: message.id, conversationId: conversation.id, leadId, campaignDraftId };
    });
  }

  async finishOutreach(input: { organizationId: string; actorUserId: string; channelId: string; messageId: string; conversationId: string; leadId: string; campaignDraftId: string; deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null }): Promise<void> {
    await database.transaction(async (transaction) => {
      const delivered = input.deliveryState === 'accepted';
      await transaction.update(messages).set({ deliveryState: delivered ? 'accepted' : input.deliveryState, externalMessageId: input.externalMessageId }).where(and(eq(messages.id, input.messageId), eq(messages.organizationId, input.organizationId)));
      await transaction.update(outboxEvents).set({ status: delivered ? CAMPAIGN_OUTBOX_STATUS.published : CAMPAIGN_OUTBOX_STATUS.failed, publishedAt: delivered ? new Date() : null, lastErrorCode: delivered ? null : CAMPAIGN_OUTREACH_REVIEW_CODE })
        .where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.idempotencyKey, `${CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX}${input.campaignDraftId}:${input.leadId}`)));
      if (delivered) {
        const [updatedLead] = await transaction.update(leads).set({ status: LEAD_STATUS.contacting, updatedAt: new Date() }).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, LEAD_STATUS.ready))).returning({ id: leads.id });
        if (updatedLead) await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: LEAD_STATUS.ready, toStatus: LEAD_STATUS.contacting, changedByUserId: input.actorUserId });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorType: AUDIT_ACTOR_TYPE.system, action: 'campaign.initial_message_accepted', entityType: CAMPAIGN_AUDIT.entity, entityId: input.campaignDraftId, afterState: { leadId: input.leadId, conversationId: input.conversationId, messageId: input.messageId, channelId: input.channelId } });
        const [remaining] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.pending)));
        const [needsReview] = await transaction.select({ total: count() }).from(outboxEvents).where(and(eq(outboxEvents.organizationId, input.organizationId), eq(outboxEvents.aggregateId, input.campaignDraftId), eq(outboxEvents.eventType, CAMPAIGN_OUTREACH_EVENT), eq(outboxEvents.status, CAMPAIGN_OUTBOX_STATUS.failed)));
        if ((remaining?.total ?? 0) === 0 && (needsReview?.total ?? 0) === 0) await transaction.update(campaignDrafts).set({ status: CAMPAIGN_DRAFT_STATUS.completed, updatedAt: new Date() }).where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), inArray(campaignDrafts.status, [CAMPAIGN_DRAFT_STATUS.active, CAMPAIGN_DRAFT_STATUS.paused])));
      }
    });
  }

  async operationalSnapshot(input: CampaignOperationalSnapshotRepositoryDto): Promise<CampaignOperationalSnapshotDto | null> {
    const [draft] = await database.select({ channelId: campaignDrafts.channelId, operationMode: messagingChannels.operationMode, provider: messagingChannels.provider, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, campaignDailyMessageLimit: campaignDrafts.dailyMessageLimit, channelDailyMessageLimit: messagingChannels.dailyMessageLimit, channelDailyMessageCount: sql<number>`(select count(*)::int from ${messages} inner join ${conversations} on ${conversations.id} = ${messages.conversationId} and ${conversations.organizationId} = ${messages.organizationId} where ${messages.organizationId} = ${messagingChannels.organizationId} and ${conversations.channelId} = ${messagingChannels.id} and ${messages.direction} = ${CHANNEL_QUOTA_COUNTED_DIRECTION} and ${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE} and (${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date)`, channelActive: messagingChannels.isActive, channelConfigured: sql<boolean>`(${messagingChannels.credentialsCiphertext} is not null and ${messagingChannels.credentialsIv} is not null and ${messagingChannels.credentialsAuthTag} is not null)`, agentReady: sql<boolean>`exists (select 1 from ${agentSettings} where ${agentSettings.organizationId} = ${campaignDrafts.organizationId} and ${agentSettings.agentKey} = ${SDR_AGENT_KEY} and ${agentSettings.enabled} = true and length(trim(${agentSettings.systemPrompt})) > 0)`, openingMessage: campaignDrafts.openingMessage })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(and(eq(campaignDrafts.id, input.campaignDraftId), eq(campaignDrafts.organizationId, input.organizationId), eq(campaignDrafts.status, CAMPAIGN_DRAFT_STATUS.draft))).limit(1);
    if (!draft) return null;
    const [audience] = await database.select({ total: count() }).from(campaignDraftAudiences)
      .where(and(eq(campaignDraftAudiences.organizationId, input.organizationId), eq(campaignDraftAudiences.campaignDraftId, input.campaignDraftId)));
    const holidays = await database.select({ date: campaignNoSendDates.date, name: campaignNoSendDates.name }).from(campaignNoSendDates).where(eq(campaignNoSendDates.organizationId, input.organizationId)).orderBy(campaignNoSendDates.date);
    return new CampaignOperationalSnapshotDto(draft.channelId, channelProviderSchema.parse(draft.provider), audience?.total ?? 0, draft.channelActive && draft.operationMode !== 'inbound', draft.channelConfigured, draft.agentReady, draft.windowStart, draft.windowEnd, draft.timeZone, draft.campaignDailyMessageLimit, draft.channelDailyMessageLimit, draft.channelDailyMessageCount, draft.openingMessage, holidays);
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
    const [rows, [totalRow]] = await Promise.all([database.select({ id: campaignDrafts.id, name: campaignDrafts.name, openingMessage: campaignDrafts.openingMessage, channelId: campaignDrafts.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, windowStart: campaignDrafts.windowStart, windowEnd: campaignDrafts.windowEnd, timeZone: campaignDrafts.timeZone, dailyMessageLimit: campaignDrafts.dailyMessageLimit, minimumDelaySeconds: campaignDrafts.minimumDelaySeconds, status: campaignDrafts.status, createdAt: campaignDrafts.createdAt })
      .from(campaignDrafts).innerJoin(messagingChannels, and(eq(messagingChannels.id, campaignDrafts.channelId), eq(messagingChannels.organizationId, campaignDrafts.organizationId)))
      .where(eq(campaignDrafts.organizationId, organizationId)).orderBy(desc(campaignDrafts.createdAt), desc(campaignDrafts.id)).limit(limit + 1).offset(offset),
      database.select({ total: count() }).from(campaignDrafts).where(eq(campaignDrafts.organizationId, organizationId)),
    ]);
    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const audienceCounts = pageRows.length === 0 ? [] : await database.select({ campaignDraftId: campaignDraftAudiences.campaignDraftId, total: count() }).from(campaignDraftAudiences).where(and(eq(campaignDraftAudiences.organizationId, organizationId), inArray(campaignDraftAudiences.campaignDraftId, pageRows.map((row) => row.id)))).groupBy(campaignDraftAudiences.campaignDraftId);
    const audienceCountByDraft = new Map(audienceCounts.map((row) => [row.campaignDraftId, row.total]));
    const data = pageRows.map((row) => new CampaignDraftDto(row.id, row.name, row.openingMessage, row.channelId, row.channelName, row.channelPhoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, audienceCountByDraft.get(row.id) ?? 0, row.createdAt.toISOString()));
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
        const [row] = await transaction.insert(campaignDrafts).values({ organizationId: input.organizationId, channelId: channel.id, name: input.input.name, openingMessage: input.input.openingMessage, windowStart: input.input.windowStart, windowEnd: input.input.windowEnd, timeZone: input.input.timeZone, dailyMessageLimit: input.input.dailyMessageLimit, minimumDelaySeconds: input.input.minimumDelaySeconds, status: CAMPAIGN_DRAFT_STATUS.draft, createdByUserId: input.userId }).returning();
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: AUDIT_ACTOR_TYPE.user, action: CAMPAIGN_AUDIT.created, entityType: CAMPAIGN_AUDIT.entity, entityId: row.id, correlationId: input.correlationId, afterState: { name: row.name, channelId: channel.id, windowStart: row.windowStart, windowEnd: row.windowEnd, timeZone: row.timeZone, dailyMessageLimit: row.dailyMessageLimit, minimumDelaySeconds: row.minimumDelaySeconds, status: row.status } });
        return new CampaignDraftDto(row.id, row.name, row.openingMessage, channel.id, channel.displayName, channel.phoneNumber, row.windowStart, row.windowEnd, row.timeZone, row.dailyMessageLimit, row.minimumDelaySeconds, row.status, 0, row.createdAt.toISOString());
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === DATABASE_FOREIGN_KEY_VIOLATION_CODE) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.channelInvalid, message: 'The selected channel is no longer available.' });
        throw error;
      }
    });
  }
}
