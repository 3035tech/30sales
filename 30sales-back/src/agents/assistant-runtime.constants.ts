export const ASSISTANT_RUNTIME_PROVIDER = 'anthropic' as const;
export const ASSISTANT_RESPONSE_BLOCK_TYPE = { toolUse: 'tool_use' } as const;
export const ASSISTANT_TRANSCRIPTION_PROVIDER = 'openai' as const;
export const ASSISTANT_TRANSCRIPTION_MODEL = 'gpt-transcribe' as const;
export const ASSISTANT_PRICING_VERSION = '2026-11-16' as const;
export const ASSISTANT_RUN_OPERATIONS = { replyGeneration: 'reply_generation', audioTranscription: 'audio_transcription' } as const;
export const ASSISTANT_RUN_OPERATION_VALUES = [ASSISTANT_RUN_OPERATIONS.replyGeneration, ASSISTANT_RUN_OPERATIONS.audioTranscription] as const;
export type AssistantRunOperation = (typeof ASSISTANT_RUN_OPERATIONS)[keyof typeof ASSISTANT_RUN_OPERATIONS];
export const ASSISTANT_TRANSCRIPTION_PRICE_PER_MINUTE_USD = 0.0045;
const TOKEN_PRICE_PER_MILLION_USD: Readonly<Record<string, { input: number; output: number; inputOver100k?: number; outputOver100k?: number }>> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, inputOver100k: 0.5, outputOver100k: 2.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};
export function estimateAssistantTokenCostUsd(model: string, inputTokens: number, outputTokens: number): string | null {
  const price = TOKEN_PRICE_PER_MILLION_USD[model];
  if (!price) return null;
  const over100k = inputTokens > 100_000;
  const cost = (inputTokens * (over100k ? price.inputOver100k ?? price.input : price.input) + outputTokens * (over100k ? price.outputOver100k ?? price.output : price.output)) / 1_000_000;
  return cost.toFixed(10);
}
export function estimateAssistantTranscriptionCostUsd(durationSeconds: number): string {
  return ((durationSeconds / 60) * ASSISTANT_TRANSCRIPTION_PRICE_PER_MINUTE_USD).toFixed(10);
}
export const ASSISTANT_REPLY_IDEMPOTENCY_PREFIX = 'assistant-reply:' as const;
export const ASSISTANT_UNKNOWN_DELIVERY_STATE = 'unknown' as const;
export const ASSISTANT_PROVIDER_DELIVERY_STATES = ['accepted', 'failed', ASSISTANT_UNKNOWN_DELIVERY_STATE] as const;
export type AssistantProviderDeliveryState = (typeof ASSISTANT_PROVIDER_DELIVERY_STATES)[number];
export const ASSISTANT_RUN_PROVIDER_VALUES = [ASSISTANT_RUNTIME_PROVIDER, ASSISTANT_TRANSCRIPTION_PROVIDER] as const;

export const ASSISTANT_RUN_STATUSES = {
  started: 'started',
  completed: 'completed',
  failed: 'failed',
} as const;
export const ASSISTANT_RUN_STATUS_VALUES = ['started', 'completed', 'failed'] as const;
export type AssistantRunStatus = (typeof ASSISTANT_RUN_STATUSES)[keyof typeof ASSISTANT_RUN_STATUSES];

export const ASSISTANT_STOP_REASONS = {
  endTurn: 'end_turn',
  toolUse: 'tool_use',
  maxTokens: 'max_tokens',
  refusal: 'refusal',
  stopSequence: 'stop_sequence',
  other: 'other',
} as const;
export const ASSISTANT_STOP_REASON_VALUES = ['end_turn', 'tool_use', 'max_tokens', 'refusal', 'stop_sequence', 'other'] as const;
export type AssistantStopReason = (typeof ASSISTANT_STOP_REASONS)[keyof typeof ASSISTANT_STOP_REASONS];

export const ASSISTANT_DELIVERY_OUTCOMES = {
  pending: 'pending',
  messageCreated: 'message_created',
  skipped: 'skipped',
  error: 'error',
} as const;
export const ASSISTANT_DELIVERY_OUTCOME_VALUES = ['pending', 'message_created', 'skipped', 'error'] as const;
export type AssistantDeliveryOutcome = (typeof ASSISTANT_DELIVERY_OUTCOMES)[keyof typeof ASSISTANT_DELIVERY_OUTCOMES];

export const ASSISTANT_INTENTS = {
  qualification: 'qualification',
  informationRequest: 'information_request',
  explicitHumanRequest: 'explicit_human_request',
  meetingRequest: 'meeting_request',
  proposalRequest: 'proposal_request',
  notInterested: 'not_interested',
  unclear: 'unclear',
} as const;
export const ASSISTANT_INTENT_VALUES = ['qualification', 'information_request', 'explicit_human_request', 'meeting_request', 'proposal_request', 'not_interested', 'unclear'] as const;
