export const ASSISTANT_CONVERSATION_ASSIST_MODES = ['summary', 'question'] as const;
export const ASSISTANT_CONVERSATION_ASSIST_MODE = { summary: 'summary', question: 'question' } as const;
export const ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH = 1200;
export const ASSISTANT_MANUAL_ACTION = { replyDrafted: 'assistant.manual_reply_drafted', conversationConsulted: 'assistant.conversation_consulted' } as const;
export const ASSISTANT_MANUAL_CONVERSATION_MODES = ['human', 'paused'] as const;
export const ASSISTANT_MANUAL_CONVERSATION_STATUSES = ['open', 'pending'] as const;
