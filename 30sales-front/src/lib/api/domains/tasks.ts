import { request } from '../request';
import { z } from 'zod';
import { type TaskDto, taskPageSchema, taskResult, taskSchema } from '../contracts';


export const tasksApi = {
    list: (params: { taskId?: string; from?: string; to?: string; assignedToUserId?: string; status?: TaskDto['status']; search?: string; sortBy?: 'dueAt' | 'title' | 'accountName' | 'contactName'; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.taskId) search.set('taskId', params.taskId);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.status) search.set('status', params.status);
      if (params.search) search.set('search', params.search);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/leads/tasks?${search.toString()}`, z.array(taskSchema));
    },
    listPage: (params: { taskId?: string; from?: string; to?: string; assignedToUserId?: string; status?: TaskDto['status']; search?: string; sortBy: 'dueAt' | 'title' | 'accountName' | 'contactName'; sortDirection: 'asc' | 'desc'; limit: number; offset: number }) => {
      const search = new URLSearchParams();
      if (params.taskId) search.set('taskId', params.taskId);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.status) search.set('status', params.status);
      if (params.search) search.set('search', params.search);
      search.set('sortBy', params.sortBy); search.set('sortDirection', params.sortDirection);
      search.set('limit', String(params.limit)); search.set('offset', String(params.offset));
      return request(`/api/v1/leads/tasks/page?${search.toString()}`, taskPageSchema);
    },
    create: (leadId: string, input: { title: string; dueAt: string }) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/tasks`, taskSchema, { method: 'POST', body: JSON.stringify(input) }),
    complete: (id: string, input: { result: z.infer<typeof taskResult>; resultNote?: string; followUp?: { title: string; dueAt: string } }) => request(`/api/v1/leads/tasks/${encodeURIComponent(id)}/complete`, taskSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  };
