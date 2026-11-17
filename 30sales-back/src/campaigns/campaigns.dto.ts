import { z } from 'zod';
import { CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIENCE_PAGE_SIZE, CAMPAIGN_DRAFT_LIMITS, CAMPAIGN_DRAFT_STATUSES, CAMPAIGN_NO_SEND_DATE_LIMITS, CAMPAIGN_TIME_PATTERN } from './campaigns.constants';
import { LEAD_SOURCES, LEAD_STATUSES, SDR_READINESS_BLOCKERS } from '../leads/constants';
import type { LeadRepositoryAccessDto } from '../leads/leads.dto';
import type { ChannelHealthStatus } from '../channels/channels.dto';

export const listCampaignDraftsSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListCampaignDraftsDto = z.infer<typeof listCampaignDraftsSchema>;
export class CampaignDraftListRepositoryDto { constructor(readonly organizationId: string, readonly query: ListCampaignDraftsDto) {} }

export const createCampaignDraftSchema = z.object({
  name: z.string().trim().min(2).max(CAMPAIGN_DRAFT_LIMITS.name),
  openingMessage: z.string().trim().min(1).max(CAMPAIGN_DRAFT_LIMITS.openingMessage),
  channelId: z.string().uuid(),
  windowStart: z.string().regex(CAMPAIGN_TIME_PATTERN),
  windowEnd: z.string().regex(CAMPAIGN_TIME_PATTERN),
  timeZone: z.string().trim().min(1).max(80),
  dailyMessageLimit: z.number().int().min(CAMPAIGN_DRAFT_LIMITS.dailyMessagesMin).max(CAMPAIGN_DRAFT_LIMITS.dailyMessagesMax),
  minimumDelaySeconds: z.number().int().min(CAMPAIGN_DRAFT_LIMITS.delaySecondsMin).max(CAMPAIGN_DRAFT_LIMITS.delaySecondsMax),
}).strict().superRefine((input, context) => {
  if (input.windowStart >= input.windowEnd) context.addIssue({ code: 'custom', path: ['windowEnd'], message: 'The end of the sending window must be after its start.' });
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); } catch { context.addIssue({ code: 'custom', path: ['timeZone'], message: 'Choose a valid time zone.' }); }
});
export type CreateCampaignDraftDto = z.infer<typeof createCampaignDraftSchema>;

export const campaignAudiencePreviewQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(CAMPAIGN_AUDIENCE_PAGE_SIZE).default(CAMPAIGN_AUDIENCE_PAGE_SIZE), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type CampaignAudiencePreviewQueryDto = z.infer<typeof campaignAudiencePreviewQuerySchema>;
export const saveCampaignAudienceSchema = z.object({ leadIds: z.array(z.string().uuid()).max(CAMPAIGN_AUDIENCE_MAX_LEADS) }).strict().superRefine((input, context) => {
  if (new Set(input.leadIds).size !== input.leadIds.length) context.addIssue({ code: 'custom', path: ['leadIds'], message: 'A lead can only appear once in a campaign audience.' });
});
export type SaveCampaignAudienceDto = z.infer<typeof saveCampaignAudienceSchema>;
export class CampaignAudiencePreviewRepositoryDto { constructor(readonly organizationId: string, readonly campaignDraftId: string, readonly access: LeadRepositoryAccessDto, readonly query: CampaignAudiencePreviewQueryDto) {} }
export class CampaignAudienceSaveRepositoryDto { constructor(readonly organizationId: string, readonly campaignDraftId: string, readonly userId: string, readonly correlationId: string | null, readonly access: LeadRepositoryAccessDto, readonly input: SaveCampaignAudienceDto) {} }

export class CampaignDraftCreateRepositoryDto {
  constructor(readonly organizationId: string, readonly userId: string, readonly correlationId: string | null, readonly input: CreateCampaignDraftDto) {}
}
export class CampaignStartRepositoryDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly campaignDraftId: string, readonly correlationId: string | null) {} }
export class CampaignStartResultDto { constructor(readonly campaignDraftId: string, readonly queuedCount: number, readonly status: (typeof CAMPAIGN_DRAFT_STATUSES)[number]) {} }
export class CampaignDraftDto {
  constructor(readonly id: string, readonly name: string, readonly openingMessage: string, readonly channelId: string, readonly channelName: string, readonly channelPhoneNumber: string, readonly windowStart: string, readonly windowEnd: string, readonly timeZone: string, readonly dailyMessageLimit: number, readonly minimumDelaySeconds: number, readonly status: (typeof CAMPAIGN_DRAFT_STATUSES)[number], readonly audienceLeadCount: number, readonly createdAt: string) {}
}
export class CampaignDraftPageDto {
  constructor(readonly data: CampaignDraftDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
export class CampaignAudienceLeadDto {
  constructor(readonly leadId: string, readonly accountName: string, readonly contactName: string | null, readonly phone: string | null, readonly status: (typeof LEAD_STATUSES)[number], readonly source: (typeof LEAD_SOURCES)[number], readonly blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]>, readonly selected: boolean) {}
}
export class CampaignAudiencePreviewDto {
  constructor(readonly leads: CampaignAudienceLeadDto[], readonly pageSummary: { readonly eligible: number; readonly excluded: number }, readonly selectedLeadIds: string[], readonly restrictedSelectedCount: number, readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
export class CampaignAudienceSaveDto { constructor(readonly campaignDraftId: string, readonly selectedCount: number) {} }
export class CampaignOperationalReadinessDto {
  constructor(readonly campaignDraftId: string, readonly checkedAt: string, readonly audienceCount: number, readonly channel: { readonly active: boolean; readonly configured: boolean; readonly health: ChannelHealthStatus | null }, readonly sendingWindow: { readonly openNow: boolean; readonly startsAt: string; readonly endsAt: string; readonly timeZone: string }, readonly quota: { readonly campaignLimit: number; readonly channelLimit: number; readonly channelUsed: number; readonly channelRemaining: number }, readonly holidayCalendar: { readonly configured: boolean; readonly datesCount: number; readonly noSendToday: boolean; readonly todayName: string | null }, readonly quotaReserved: boolean, readonly canQueue: boolean) {}
}
export class CampaignOperationalSnapshotDto {
  constructor(readonly channelId: string, readonly provider: 'evolution' | 'whatsapp_cloud_api', readonly audienceCount: number, readonly channelActive: boolean, readonly channelConfigured: boolean, readonly agentReady: boolean, readonly windowStart: string, readonly windowEnd: string, readonly timeZone: string, readonly campaignDailyMessageLimit: number, readonly channelDailyMessageLimit: number, readonly channelDailyMessageCount: number, readonly openingMessage: string, readonly noSendDates: Array<{ readonly date: string; readonly name: string }>) {}
}
export class CampaignOperationalSnapshotRepositoryDto { constructor(readonly organizationId: string, readonly campaignDraftId: string) {} }
export const createCampaignNoSendDateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(CAMPAIGN_NO_SEND_DATE_LIMITS.name) }).strict().superRefine((input, context) => {
  const parsed = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.date) context.addIssue({ code: 'custom', path: ['date'], message: 'Choose a valid calendar date.' });
});
export type CreateCampaignNoSendDateDto = z.infer<typeof createCampaignNoSendDateSchema>;
export class CampaignNoSendDateDto { constructor(readonly id: string, readonly date: string, readonly name: string) {} }
export class CampaignNoSendDateMutationRepositoryDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly correlationId: string | null, readonly input: CreateCampaignNoSendDateDto) {} }
export class CampaignNoSendDateDeleteRepositoryDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly correlationId: string | null, readonly id: string) {} }
