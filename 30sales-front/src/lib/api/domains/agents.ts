import { request } from '../request';
import { assistantSettingsSchema } from '../contracts';


export const agentsApi = {
    getAssistantSettings: (businessLineId?: string) => request(`/api/v1/agents/assistant${businessLineId ? `?businessLineId=${encodeURIComponent(businessLineId)}` : ''}`, assistantSettingsSchema),
    saveAssistantSettings: (input: { businessLineId: string | null; enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request('/api/v1/agents/assistant', assistantSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
    resetBusinessLineSettings: (businessLineId: string) => request(`/api/v1/agents/assistant?businessLineId=${encodeURIComponent(businessLineId)}`, assistantSettingsSchema, { method: 'DELETE' }),
  };
