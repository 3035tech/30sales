import { request } from '../request';
import { z } from 'zod';
import { assistantProfileSchema, assistantSettingsSchema } from '../contracts';
import { ASSISTANT_CONVERSATION_ASSIST_MODES } from '../../agentConstants';


export const agentsApi = {
    draftConversationReply: (conversationId: string) => request(`/api/v1/agents/assistant/conversations/${encodeURIComponent(conversationId)}/reply-draft`, z.object({ draftText: z.string().min(1) }), { method: 'POST' }),
    assistConversation: (conversationId: string, input: { mode: (typeof ASSISTANT_CONVERSATION_ASSIST_MODES)[number]; question?: string }) => request(`/api/v1/agents/assistant/conversations/${encodeURIComponent(conversationId)}/assist`, z.object({ answerText: z.string().min(1), summary: z.string().min(1), confirmedFacts: z.array(z.string()), factEvidence: z.array(z.object({ fact: z.string(), evidence: z.array(z.object({ messageId: z.string().uuid(), quote: z.string() })) })), unknowns: z.array(z.string()), nextStep: z.string().min(1) }), { method: 'POST', body: JSON.stringify(input) }),
    getAssistantSettings: (businessLineId?: string) => request(`/api/v1/agents/assistant${businessLineId ? `?businessLineId=${encodeURIComponent(businessLineId)}` : ''}`, assistantSettingsSchema),
    saveAssistantSettings: (input: { businessLineId: string | null; enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request('/api/v1/agents/assistant', assistantSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
    resetBusinessLineSettings: (businessLineId: string) => request(`/api/v1/agents/assistant?businessLineId=${encodeURIComponent(businessLineId)}`, assistantSettingsSchema, { method: 'DELETE' }),
    listAssistantProfiles: (businessLineId: string) => request(`/api/v1/agents/profiles?businessLineId=${encodeURIComponent(businessLineId)}`, z.array(assistantProfileSchema)),
    createAssistantProfile: (input: { businessLineId: string; direction: 'inbound' | 'outbound'; name: string; enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request('/api/v1/agents/profiles', assistantProfileSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateAssistantProfile: (id: string, input: { businessLineId: string; direction: 'inbound' | 'outbound'; name: string; enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request(`/api/v1/agents/profiles/${encodeURIComponent(id)}`, assistantProfileSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteAssistantProfile: (id: string) => request(`/api/v1/agents/profiles/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' }),
  };
