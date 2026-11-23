import { ASSISTANT_MANUAL_ACTION } from '../agents/agents.constants';
import { ASSISTANT_RUN_OPERATIONS } from '../agents/assistant-runtime.constants';
import { LEAD_QUALIFICATION_SUGGESTION } from '../leads/constants';

export const PLATFORM_AI_USAGE = {
  millisecondsPerDay: 86_400_000,
  maximumRangeDays: 366,
  defaultPageSize: 25,
  maximumPageSize: 100,
  defaultPageOffset: 0,
  jsonIntegerPattern: '^[0-9]{1,10}$',
  jsonDecimalPattern: '^[0-9]{1,18}(\\.[0-9]{1,10})?$',
  unknownModel: 'unknown',
  costDecimalPlaces: 10,
} as const;

export const PLATFORM_AI_USAGE_AUDIT_OPERATIONS = {
  replyDraft: { action: ASSISTANT_MANUAL_ACTION.replyDrafted, operation: 'manual_reply_draft' },
  conversationConsultation: { action: ASSISTANT_MANUAL_ACTION.conversationConsulted, operation: 'conversation_consultation' },
  qualificationSuggestions: { action: LEAD_QUALIFICATION_SUGGESTION.auditAction, operation: 'qualification_suggestions' },
} as const;

export const PLATFORM_AI_USAGE_OPERATIONS = {
  ...ASSISTANT_RUN_OPERATIONS,
  manualReplyDraft: PLATFORM_AI_USAGE_AUDIT_OPERATIONS.replyDraft.operation,
  conversationConsultation: PLATFORM_AI_USAGE_AUDIT_OPERATIONS.conversationConsultation.operation,
  qualificationSuggestions: PLATFORM_AI_USAGE_AUDIT_OPERATIONS.qualificationSuggestions.operation,
} as const;

export const PLATFORM_AI_USAGE_AUDIT_ACTIONS = Object.values(PLATFORM_AI_USAGE_AUDIT_OPERATIONS).map(({ action }) => action);
