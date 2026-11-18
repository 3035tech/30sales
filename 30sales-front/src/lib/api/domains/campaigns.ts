import { request } from '../request';
import { z } from 'zod';
import { type CreateCampaignDraftInput, campaignAudiencePreviewSchema, campaignAudienceSaveSchema, campaignDeliveryConfirmSchema, campaignDeliveryReviewPageSchema, campaignDraftPageSchema, campaignDraftSchema, campaignNoSendDateSchema, campaignOperationalReadinessSchema, campaignPerformanceSchema, campaignStartResultSchema, campaignStatusChangeSchema } from '../contracts';


export const campaignsApi = {
    listDrafts: (params: { limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/campaign-drafts?${query.toString()}`, campaignDraftPageSchema); },
    createDraft: (input: CreateCampaignDraftInput) => request('/api/v1/campaign-drafts', campaignDraftSchema, { method: 'POST', body: JSON.stringify(input) }),
    previewAudience: (id: string, params: { limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/audience/preview?${query.toString()}`, campaignAudiencePreviewSchema); },
    saveAudience: (id: string, leadIds: string[]) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/audience`, campaignAudienceSaveSchema, { method: 'PUT', body: JSON.stringify({ leadIds }) }),
    operationalReadiness: (id: string) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/operational-readiness`, campaignOperationalReadinessSchema),
    performance: (id: string) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/performance`, campaignPerformanceSchema),
    startDraft: (id: string) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/start`, campaignStartResultSchema, { method: 'POST' }),
    pauseDraft: (id: string) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/pause`, campaignStatusChangeSchema, { method: 'POST' }),
    resumeDraft: (id: string) => request(`/api/v1/campaign-drafts/${encodeURIComponent(id)}/resume`, campaignStatusChangeSchema, { method: 'POST' }),
    listDeliveryReview: (params: { limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/campaign-drafts/delivery-review?${query.toString()}`, campaignDeliveryReviewPageSchema); },
    confirmDeliverySent: (id: string) => request(`/api/v1/campaign-drafts/delivery-review/${encodeURIComponent(id)}/confirm-sent`, campaignDeliveryConfirmSchema, { method: 'POST' }),
    listNoSendDates: () => request('/api/v1/campaign-drafts/holiday-calendar', z.array(campaignNoSendDateSchema)),
    addNoSendDate: (input: { date: string; name: string }) => request('/api/v1/campaign-drafts/holiday-calendar', campaignNoSendDateSchema, { method: 'POST', body: JSON.stringify(input) }),
    importNationalHolidays: () => request('/api/v1/campaign-drafts/holiday-calendar/import-national', z.array(campaignNoSendDateSchema), { method: 'POST' }),
    deleteNoSendDate: (id: string) => request(`/api/v1/campaign-drafts/holiday-calendar/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' }),
  };
