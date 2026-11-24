import { request, requestBlob } from '../request';
import { apiEventSource } from '../client';
import { z } from 'zod';
import { type ConversationDto, channelSchema, conversationPageSchema, conversationGroupParticipantsSchema, conversationTagSchema, messageSchema } from '../contracts';


export const inboxApi = {
    subscribe: async () => apiEventSource('/api/v1/conversations/events'),
    conversations: (params: { conversationId?: string; businessLineId?: string; status?: ConversationDto['status']; channelId?: string; tagId?: string; ownerUserId?: string; search?: string; unreadOnly?: boolean; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.conversationId) search.set('conversationId', params.conversationId);
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.status) search.set('status', params.status);
      if (params.channelId) search.set('channelId', params.channelId);
      if (params.tagId) search.set('tagId', params.tagId);
      if (params.ownerUserId) search.set('ownerUserId', params.ownerUserId);
      if (params.search) search.set('search', params.search);
      if (params.unreadOnly) search.set('unreadOnly', 'true');
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/conversations?${search.toString()}`, conversationPageSchema);
    },
    channels: () => request('/api/v1/conversations/channels', z.array(channelSchema)),
    tags: () => request('/api/v1/conversations/tags', z.array(conversationTagSchema)),
    assignees: () => request('/api/v1/conversations/assignees', z.array(z.object({ id: z.string().uuid(), name: z.string(), role: z.string() }))),
    messages: (conversationId: string, params: { limit?: number; offset?: number; search?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?${search.toString()}`, z.array(messageSchema));
    },
    groupParticipants: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/group-participants`, conversationGroupParticipantsSchema),
    downloadAttachment: (attachmentId: string) => requestBlob(`/api/v1/attachments/${encodeURIComponent(attachmentId)}/content`),
    retryAttachment: (attachmentId: string) => request(`/api/v1/attachments/${encodeURIComponent(attachmentId)}/retry`, z.object({ id: z.string().uuid(), status: z.literal('pending') }), { method: 'POST' }),
    markRead: (conversationId: string, lastInboundMessageId: string | null) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, z.object({ conversationId: z.string().uuid(), lastReadAt: z.string().nullable() }), { method: 'POST', body: JSON.stringify({ lastInboundMessageId }) }),
    claim: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/claim`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST' }),
    assign: (conversationId: string, ownerUserId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/owner`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    release: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/release`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST' }),
    setAutomationMode: (conversationId: string, mode: 'assistant' | 'paused') => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/automation`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST', body: JSON.stringify(mode) }),
    setStatus: (conversationId: string, status: 'open' | 'resolved') => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/status`, z.object({ id: z.string().uuid(), status: z.enum(['open','resolved']) }), { method: 'PATCH', body: JSON.stringify({ status }) }),
    reconcileContact: (conversationId: string, input: { leadId: string; name?: string; phone?: string; isPrimary: boolean; isInterested: boolean }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/contact`, z.object({ conversationId: z.string().uuid(), leadId: z.string().uuid(), accountName: z.string(), contactName: z.string(), phone: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify(input) }),
    sendMessage: (conversationId: string, input: { bodyText: string; idempotencyKey: string; targetMessageId?: string; mode?: 'reply' | 'reaction' }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    sendMediaMessage: (conversationId: string, input: { bodyText: string; idempotencyKey: string; file: File }) => {
      const form = new FormData();
      form.set('file', input.file, input.file.name);
      form.set('bodyText', input.bodyText);
      form.set('idempotencyKey', input.idempotencyKey);
      return request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/media`, messageSchema, { method: 'POST', body: form });
    },
    sendContactMessage: (conversationId: string, input: { fullName: string; phoneNumber: string; organization?: string; email?: string; url?: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/contact`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    addNote: (conversationId: string, input: { bodyText: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/notes`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    addTag: (conversationId: string, name: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags`, conversationTagSchema, { method: 'POST', body: JSON.stringify({ name }) }),
    removeTag: (conversationId: string, tagId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`, z.object({ success: z.boolean() }), { method: 'DELETE' }),
  };
