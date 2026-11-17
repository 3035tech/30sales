import { request } from '../request';
import { z } from 'zod';
import { type HandoffDto, handoffPageSchema, handoffSchema } from '../contracts';


export const handoffsApi = {
    list: (status: HandoffDto['status'] = 'requested', params: { limit?: number; offset?: number; handoffId?: string } = {}) => {
      const search = new URLSearchParams({ status, limit: String(params.limit ?? 100) });
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      if (params.handoffId) search.set('handoffId', params.handoffId);
      return request(`/api/v1/handoffs?${search.toString()}`, z.array(handoffSchema));
    },
    listPage: (status: HandoffDto['status'], params: { limit: number; offset: number; handoffId?: string; search?: string; sortBy: 'requestedAt' | 'accountName' | 'contactName' | 'nextStepAt'; sortDirection: 'asc' | 'desc' }) => {
      const search = new URLSearchParams({ status, limit: String(params.limit), offset: String(params.offset), sortBy: params.sortBy, sortDirection: params.sortDirection });
      if (params.handoffId) search.set('handoffId', params.handoffId);
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/handoffs/page?${search.toString()}`, handoffPageSchema);
    },
    create: (input: { leadId: string; reason: string; evidence: string; confirmedFacts: string[]; unknowns: string[]; nextStep: string; nextStepAt: string }) => request('/api/v1/handoffs', handoffSchema, { method: 'POST', body: JSON.stringify(input) }),
    accept: (id: string) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/accept`, handoffSchema, { method: 'PATCH' }),
    returnToSdr: (id: string, input: { reason: string; nextStep: string; dueAt: string }) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/return`, handoffSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  };
