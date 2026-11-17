import { request } from '../request';
import { auditEventsPageSchema } from '../contracts';


export const auditApi = {
    list: (params: { action?: string; entityType?: string; from?: string; to?: string; sortBy?: 'occurredAt' | 'action' | 'actorName' | 'entityType' | 'reason'; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.action) search.set('action', params.action);
      if (params.entityType) search.set('entityType', params.entityType);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/audit-events?${search.toString()}`, auditEventsPageSchema);
    },
  };
