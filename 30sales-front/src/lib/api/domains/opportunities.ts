import { request, requestBlob } from '../request';
import { z } from 'zod';
import { type ActivityType, type OpportunityStage, activitySchema, opportunityAssigneeSchema, opportunityConversationContextSchema, opportunityHistorySchema, opportunityPageSchema, opportunityPipelineSummarySchema, opportunityProposalSchema, opportunitySchema, pipelineStagesSchema, pipelinesSchema } from '../contracts';


export const opportunitiesApi = {
    pipelines: {
      list: () => request('/api/v1/opportunities/pipelines', pipelinesSchema),
      create: (name: string, businessLineId?: string) => request('/api/v1/opportunities/pipelines', pipelinesSchema, { method: 'POST', body: JSON.stringify({ name, businessLineId }) }),
      rename: (id: string, name: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}`, pipelinesSchema, { method: 'PATCH', body: JSON.stringify({ name }) }),
      setDefault: (id: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}/default`, pipelinesSchema, { method: 'PATCH' }),
      archive: (id: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}`, pipelinesSchema, { method: 'DELETE' }),
    },
    pipelineStages: {
      list: (pipelineId?: string) => request(`/api/v1/opportunities/pipeline-stages${pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : ''}`, pipelineStagesSchema),
      create: (input: { pipelineId: string; name: string; afterStageKey: string }) => request('/api/v1/opportunities/pipeline-stages', pipelineStagesSchema, { method: 'POST', body: JSON.stringify(input) }),
      update: (key: string, input: { pipelineId: string; name: string }) => request(`/api/v1/opportunities/pipeline-stages/${encodeURIComponent(key)}`, pipelineStagesSchema, { method: 'PATCH', body: JSON.stringify(input) }),
      reorder: (pipelineId: string, stageKeys: string[]) => request('/api/v1/opportunities/pipeline-stages/order', pipelineStagesSchema, { method: 'PATCH', body: JSON.stringify({ pipelineId, stageKeys }) }),
      archive: (pipelineId: string, key: string) => request(`/api/v1/opportunities/pipeline-stages/${encodeURIComponent(key)}?pipelineId=${encodeURIComponent(pipelineId)}`, pipelineStagesSchema, { method: 'DELETE' }),
    },
    assignees: () => request('/api/v1/opportunities/assignees', z.array(opportunityAssigneeSchema)),
    assignOwner: (id: string, ownerUserId: string | null) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/owner`, opportunitySchema, { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    list: (params: { businessLineId?: string; view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; pipelineStageKey?: string; assignedToUserId?: string; dueAfter?: string; dueBefore?: string; noNextAction?: boolean; search?: string; opportunityId?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.view) search.set('view', params.view);
      if (params.stage) search.set('stage', params.stage);
      if (params.pipelineStageKey) search.set('pipelineStageKey', params.pipelineStageKey);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.dueAfter) search.set('dueAfter', params.dueAfter);
      if (params.dueBefore) search.set('dueBefore', params.dueBefore);
      if (params.noNextAction) search.set('noNextAction', 'true');
      if (params.search) search.set('search', params.search);
      if (params.opportunityId) search.set('opportunityId', params.opportunityId);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/opportunities?${search.toString()}`, z.array(opportunitySchema));
    },
    listPage: (params: { businessLineId?: string; pipelineId?: string; view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; pipelineStageKey?: string; assignedToUserId?: string; dueAfter?: string; dueBefore?: string; noNextAction?: boolean; opportunityId?: string; search?: string; sortBy: 'nextActionAt' | 'accountName' | 'contactName' | 'stageChangedAt' | 'opportunityName' | 'stage' | 'ownerName'; sortDirection: 'asc' | 'desc'; limit: number; offset: number }) => {
      const search = new URLSearchParams({ view: params.view ?? 'mine', sortBy: params.sortBy, sortDirection: params.sortDirection, limit: String(params.limit), offset: String(params.offset) });
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.stage) search.set('stage', params.stage);
      if (params.pipelineId) search.set('pipelineId', params.pipelineId);
      if (params.pipelineStageKey) search.set('pipelineStageKey', params.pipelineStageKey);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.dueAfter) search.set('dueAfter', params.dueAfter);
      if (params.dueBefore) search.set('dueBefore', params.dueBefore);
      if (params.noNextAction) search.set('noNextAction', 'true');
      if (params.opportunityId) search.set('opportunityId', params.opportunityId);
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/opportunities/page?${search.toString()}`, opportunityPageSchema);
    },
    summary: (params: { businessLineId?: string; pipelineId?: string; view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; pipelineStageKey?: string; assignedToUserId?: string; dueAfter?: string; dueBefore?: string; noNextAction?: boolean; search?: string }) => {
      const search = new URLSearchParams({ view: params.view ?? 'mine' });
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.pipelineId) search.set('pipelineId', params.pipelineId);
      if (params.stage) search.set('stage', params.stage);
      if (params.pipelineStageKey) search.set('pipelineStageKey', params.pipelineStageKey);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.dueAfter) search.set('dueAfter', params.dueAfter);
      if (params.dueBefore) search.set('dueBefore', params.dueBefore);
      if (params.noNextAction) search.set('noNextAction', 'true');
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/opportunities/summary?${search.toString()}`, opportunityPipelineSummarySchema);
    },
    transition: (id: string, input: { expectedPipelineId: string; pipelineId: string; expectedStage: OpportunityStage; expectedPipelineStageKey?: string; stage: OpportunityStage; pipelineStageKey?: string; reason?: string; nextAction?: string; nextActionAt?: string; amount?: string; currency?: string; closedAt?: string; lossReason?: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/stage`, opportunitySchema, { method: 'PATCH', body: JSON.stringify(input) }),
    history: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/history`, z.array(opportunityHistorySchema)),
    conversationContexts: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/conversation-contexts`, z.array(opportunityConversationContextSchema)),
    activities: {
      list: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, z.array(activitySchema)),
      create: (id: string, input: { type: ActivityType; subject: string; details?: string; result?: string; occurredAt: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, activitySchema, { method: 'POST', body: JSON.stringify(input) }),
    },
    proposals: {
      list: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/proposals`, z.array(opportunityProposalSchema)),
      create: (id: string, input: { amount: string; currency: string; billingTerm: 'monthly' | 'quarterly' | 'annual' | 'one_time'; sentAt: string; file: File }) => {
        const form = new FormData();
        form.set('amount', input.amount); form.set('currency', input.currency); form.set('billingTerm', input.billingTerm); form.set('sentAt', input.sentAt); form.set('file', input.file, input.file.name);
        return request(`/api/v1/opportunities/${encodeURIComponent(id)}/proposals`, opportunityProposalSchema, { method: 'POST', body: form });
      },
      download: (opportunityId: string, proposalId: string) => requestBlob(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}/proposals/${encodeURIComponent(proposalId)}/content`),
    },
  };
