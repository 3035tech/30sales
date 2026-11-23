export const CAMPAIGN_DRAFT_STATUS = { draft: 'draft', active: 'active', completed: 'completed', paused: 'paused' } as const;
export const CAMPAIGN_DRAFT_STATUSES = [CAMPAIGN_DRAFT_STATUS.draft, CAMPAIGN_DRAFT_STATUS.active, CAMPAIGN_DRAFT_STATUS.completed, CAMPAIGN_DRAFT_STATUS.paused] as const;
export type CampaignDraftStatus = (typeof CAMPAIGN_DRAFT_STATUSES)[number];
export const CAMPAIGN_DRAFT_LIMITS = { name: 120, openingMessage: 4096, dailyMessagesMin: 1, dailyMessagesMax: 500, delaySecondsMin: 5, delaySecondsMax: 300 } as const;
export const CAMPAIGN_OPENING_MESSAGE_DEFAULT = 'Olá! Tudo bem? Gostaria de conversar com você.' as const;
export const CAMPAIGN_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const CAMPAIGN_TIME_ZONE_DEFAULT = 'America/Sao_Paulo';
export const CAMPAIGN_AUDIT = { created: 'campaign_draft.created', started: 'campaign.started', deliveryConfirmedSent: 'campaign.delivery_confirmed_sent', deliveryConfirmedNotSentRequeued: 'campaign.delivery_confirmed_not_sent_requeued', entity: 'campaign_draft' } as const;
export const CAMPAIGN_ERROR_CODE = { channelUnavailable: 'CAMPAIGN_DRAFT_CHANNEL_UNAVAILABLE', channelInvalid: 'CAMPAIGN_DRAFT_CHANNEL_INVALID', crossLineChannels: 'CAMPAIGN_CHANNELS_MUST_SHARE_BUSINESS_LINE', audienceIneligible: 'CAMPAIGN_AUDIENCE_LEAD_INELIGIBLE', audienceLimit: 'CAMPAIGN_AUDIENCE_LIMIT_EXCEEDED', draftNotFound: 'CAMPAIGN_DRAFT_NOT_FOUND', notReady: 'CAMPAIGN_NOT_READY', alreadyStarted: 'CAMPAIGN_ALREADY_STARTED', invalidState: 'CAMPAIGN_INVALID_STATE' } as const;
export const CAMPAIGN_OUTREACH_EVENT = 'campaign.initial_outreach_requested' as const;
export const CAMPAIGN_PENDING_REPLY_CONVERSATION_STATUSES = ['open', 'pending'] as const;
export const CAMPAIGN_OUTREACH_IDEMPOTENCY_PREFIX = 'campaign-initial-outreach:' as const;
export const CAMPAIGN_OUTBOX_STATUS = { pending: 'pending', processing: 'processing', published: 'published', failed: 'failed' } as const;
export const CAMPAIGN_OUTREACH_LEASE_SECONDS = 120;
export const CAMPAIGN_OUTREACH_REVIEW_CODE = 'CAMPAIGN_OUTREACH_DELIVERY_REQUIRES_REVIEW' as const;
export const DATABASE_FOREIGN_KEY_VIOLATION_CODE = '23503';
export const CAMPAIGN_NO_SEND_DATE_SOURCE = { nationalPreset: 'national_preset' } as const;
export const CAMPAIGN_AUDIENCE_MAX_LEADS = 500;
export const CAMPAIGN_AUDIENCE_PAGE_SIZE = 50;
export const CAMPAIGN_AUDIENCE_AUDIT_ACTION = 'campaign_draft.audience_saved';
export const CAMPAIGN_NO_SEND_DATE_LIMITS = { maxDates: 500, name: 100 } as const;
export const CAMPAIGN_NO_SEND_DATE_AUDIT = { created: 'campaign.no_send_date_created', deleted: 'campaign.no_send_date_deleted', entity: 'campaign_no_send_date' } as const;
export const CAMPAIGN_NO_SEND_DATE_ERROR = { duplicate: 'CAMPAIGN_NO_SEND_DATE_ALREADY_EXISTS', limit: 'CAMPAIGN_NO_SEND_DATE_LIMIT_REACHED', notFound: 'CAMPAIGN_NO_SEND_DATE_NOT_FOUND' } as const;
export const CAMPAIGN_NATIONAL_HOLIDAY_PRESETS = [
  { date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' }, { date: '2026-12-25', name: 'Natal' },
  { date: '2027-01-01', name: 'Confraternização Universal' }, { date: '2027-03-26', name: 'Paixão de Cristo' }, { date: '2027-04-21', name: 'Tiradentes' }, { date: '2027-05-01', name: 'Dia Mundial do Trabalho' }, { date: '2027-09-07', name: 'Independência do Brasil' }, { date: '2027-10-12', name: 'Nossa Senhora Aparecida' }, { date: '2027-11-02', name: 'Finados' }, { date: '2027-11-15', name: 'Proclamação da República' }, { date: '2027-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' }, { date: '2027-12-25', name: 'Natal' },
  { date: '2028-01-01', name: 'Confraternização Universal' }, { date: '2028-04-14', name: 'Paixão de Cristo' }, { date: '2028-04-21', name: 'Tiradentes' }, { date: '2028-05-01', name: 'Dia Mundial do Trabalho' }, { date: '2028-09-07', name: 'Independência do Brasil' }, { date: '2028-10-12', name: 'Nossa Senhora Aparecida' }, { date: '2028-11-02', name: 'Finados' }, { date: '2028-11-15', name: 'Proclamação da República' }, { date: '2028-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' }, { date: '2028-12-25', name: 'Natal' },
  { date: '2029-01-01', name: 'Confraternização Universal' }, { date: '2029-03-30', name: 'Paixão de Cristo' }, { date: '2029-04-21', name: 'Tiradentes' }, { date: '2029-05-01', name: 'Dia Mundial do Trabalho' }, { date: '2029-09-07', name: 'Independência do Brasil' }, { date: '2029-10-12', name: 'Nossa Senhora Aparecida' }, { date: '2029-11-02', name: 'Finados' }, { date: '2029-11-15', name: 'Proclamação da República' }, { date: '2029-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' }, { date: '2029-12-25', name: 'Natal' },
  { date: '2030-01-01', name: 'Confraternização Universal' }, { date: '2030-04-19', name: 'Paixão de Cristo' }, { date: '2030-04-21', name: 'Tiradentes' }, { date: '2030-05-01', name: 'Dia Mundial do Trabalho' }, { date: '2030-09-07', name: 'Independência do Brasil' }, { date: '2030-10-12', name: 'Nossa Senhora Aparecida' }, { date: '2030-11-02', name: 'Finados' }, { date: '2030-11-15', name: 'Proclamação da República' }, { date: '2030-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' }, { date: '2030-12-25', name: 'Natal' },
] as const;
