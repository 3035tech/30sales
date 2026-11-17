import { request } from '../request';
import { assistantSettingsSchema } from '../contracts';


export const agentsApi = {
    getAssistantSettings: () => request('/api/v1/agents/assistant', assistantSettingsSchema),
    saveAssistantSettings: (input: { enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request('/api/v1/agents/assistant', assistantSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
  };
