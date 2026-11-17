import { request } from '../request';
import { z } from 'zod';
import { type AccountMarketSegment, type AccountSortBy, type LeadStatus, accountPageSchema, accountProfileSchema, accountSegmentSchema } from '../contracts';


export const accountsApi = {
    segments: () => request('/api/v1/accounts/segments', z.array(accountSegmentSchema)),
    createSegment: (name: string) => request('/api/v1/accounts/segments', accountSegmentSchema, { method: 'POST', body: JSON.stringify({ name }) }),
    assignSegment: (accountId: string, segmentId: string | null) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/segment`, z.object({ accountId: z.string().uuid(), segmentId: z.string().uuid().nullable(), segmentName: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify({ segmentId }) }),
    updateProfile: (accountId: string, profile: z.infer<typeof accountProfileSchema>) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/profile`, z.object({ accountId: z.string().uuid(), ...accountProfileSchema.shape }), { method: 'PATCH', body: JSON.stringify(profile) }),
    listPage: (params: { search?: string; leadStatus?: LeadStatus; segmentId?: string; marketSegment?: AccountMarketSegment; withoutMarketSegment?: boolean; studentCountMin?: number; studentCountMax?: number; sortBy?: AccountSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.leadStatus) search.set('leadStatus', params.leadStatus);
      if (params.segmentId) search.set('segmentId', params.segmentId);
      if (params.marketSegment) search.set('marketSegment', params.marketSegment);
      if (params.withoutMarketSegment) search.set('withoutMarketSegment', String(params.withoutMarketSegment));
      if (params.studentCountMin !== undefined) search.set('studentCountMin', String(params.studentCountMin));
      if (params.studentCountMax !== undefined) search.set('studentCountMax', String(params.studentCountMax));
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/accounts/table?${search.toString()}`, accountPageSchema);
    },
  };
