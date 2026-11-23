import { request } from '../request';
import { z } from 'zod';
import { type AccountMarketSegment, type CreateLeadContactInput, type CreateLeadInput, type CreateQualificationFactInput, type LeadSortBy, type LeadStatus, accountContactPageSchema, leadAssigneeSchema, leadContactSchema, leadDuplicateCheckSchema, leadPageSchema, leadSchema, qualificationFactPageSchema, qualificationFactSchema, qualificationSuggestionsSchema, reviewContactOutreachSchema, sdrPreviewChannelSchema, sdrPreviewSchema, sdrReadinessSchema } from '../contracts';



function listLeadPage(params: { businessLineId?: string; status?: LeadStatus; source?: CreateLeadInput['source']; assignedToUserId?: string; segmentId?: string; marketSegment?: AccountMarketSegment; withoutMarketSegment?: boolean; studentCountMin?: number; studentCountMax?: number; search?: string; sortBy?: LeadSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.businessLineId) search.set('businessLineId', params.businessLineId);
  if (params.status) search.set('status', params.status);
  if (params.source) search.set('source', params.source);
  if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
  if (params.segmentId) search.set('segmentId', params.segmentId);
  if (params.marketSegment) search.set('marketSegment', params.marketSegment);
  if (params.withoutMarketSegment) search.set('withoutMarketSegment', String(params.withoutMarketSegment));
  if (params.studentCountMin !== undefined) search.set('studentCountMin', String(params.studentCountMin));
  if (params.studentCountMax !== undefined) search.set('studentCountMax', String(params.studentCountMax));
  if (params.search) search.set('search', params.search);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDirection) search.set('sortDirection', params.sortDirection);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  return request(`/api/v1/leads/table?${search.toString()}`, leadPageSchema);
}

export const leadsApi = {
    listPage: listLeadPage,
    sdrReadiness: (id: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/sdr-readiness`, sdrReadinessSchema),
    sdrPreviewChannels: () => request('/api/v1/leads/sdr-preview/channels', z.array(sdrPreviewChannelSchema)),
    sdrPreview: (params: { channelId?: string; businessLineId?: string; limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.channelId) query.set('channelId', params.channelId); if (params.businessLineId) query.set('businessLineId', params.businessLineId); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/leads/sdr-preview?${query.toString()}`, sdrPreviewSchema) },
    checkDuplicates: (input: Pick<CreateLeadInput, 'businessLineId' | 'accountName' | 'email' | 'phone'>) => request('/api/v1/leads/duplicate-check', leadDuplicateCheckSchema, { method: 'POST', body: JSON.stringify({ businessLineId: input.businessLineId, accountName: input.accountName, email: input.email, phone: input.phone }) }),
    assignees: () => request('/api/v1/leads/assignees', z.array(leadAssigneeSchema)),
    assign: (id: string, assignedToUserId: string | null) => request(`/api/v1/leads/${encodeURIComponent(id)}/assignee`, leadSchema, { method: 'PATCH', body: JSON.stringify({ assignedToUserId }) }),
    list: (params: { businessLineId?: string; status?: LeadStatus; assignedToUserId?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.status) search.set('status', params.status);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/leads?${search.toString()}`, z.array(leadSchema));
    },
    create: (input: CreateLeadInput) => request('/api/v1/leads', leadSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateStatus: (id: string, status: LeadStatus, reason: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/status`, leadSchema, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    contacts: (id: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/contacts`, z.array(leadContactSchema)),
    accountContacts: (id: string, params: { limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/leads/${encodeURIComponent(id)}/account-contacts?${query.toString()}`, accountContactPageSchema) },
    linkAccountContact: (leadId: string, personId: string) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/link`, leadContactSchema, { method: 'POST', body: JSON.stringify({ personId }) }),
    qualificationFacts: (id: string, params: { limit?: number; offset?: number } = {}) => { const query = new URLSearchParams(); if (params.limit !== undefined) query.set('limit', String(params.limit)); if (params.offset !== undefined) query.set('offset', String(params.offset)); return request(`/api/v1/leads/${encodeURIComponent(id)}/qualification-facts?${query.toString()}`, qualificationFactPageSchema) },
    addQualificationFact: (id: string, input: CreateQualificationFactInput) => request(`/api/v1/leads/${encodeURIComponent(id)}/qualification-facts`, qualificationFactSchema, { method: 'POST', body: JSON.stringify(input) }),
    suggestQualificationFacts: (id: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/qualification-suggestions`, qualificationSuggestionsSchema, { method: 'POST' }),
    addContact: (id: string, input: CreateLeadContactInput) => request(`/api/v1/leads/${encodeURIComponent(id)}/contacts`, leadContactSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateContact: (leadId: string, contactId: string, isInterested: boolean) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/${encodeURIComponent(contactId)}`, leadContactSchema, { method: 'PATCH', body: JSON.stringify({ isInterested }) }),
    reviewContactOutreach: (leadId: string, contactId: string, input: z.infer<typeof reviewContactOutreachSchema>) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/${encodeURIComponent(contactId)}/outreach-review`, leadContactSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    setPrimaryContact: (leadId: string, contactId: string) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/${encodeURIComponent(contactId)}/primary`, leadContactSchema, { method: 'PATCH' }),
  };
