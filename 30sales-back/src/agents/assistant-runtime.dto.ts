import { z } from 'zod';

export const assistantInboundEventSchema = z.object({
  organizationId: z.string().uuid(),
  channelId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  provider: z.enum(['evolution', 'whatsapp_cloud_api']),
  externalConversationId: z.string().min(1).max(300),
  externalMessageId: z.string().min(1).max(250),
  messageType: z.string().min(1).max(80),
  bodyText: z.string().max(16000).nullable().optional(),
  occurredAt: z.string().datetime(),
}).strict();
export type AssistantInboundEventDto = z.infer<typeof assistantInboundEventSchema>;

export type AssistantRuntimeMessageDto = { role: 'user' | 'assistant'; content: string };
export const assistantAgentResponseSchema = z.object({
  replyText: z.string().trim().min(1).max(4096),
  intent: z.enum(['qualification', 'information_request', 'explicit_human_request', 'meeting_request', 'proposal_request', 'not_interested', 'unclear']),
  summary: z.string().trim().min(1).max(1000),
  confirmedFacts: z.array(z.string().trim().min(1).max(300)).max(12),
  unknowns: z.array(z.string().trim().min(1).max(300)).max(12),
  nextStep: z.string().trim().min(1).max(500),
}).strict();
export const assistantConversationSummarySchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  confirmedFacts: z.array(z.object({ fact: z.string().trim().min(1).max(300), evidence: z.array(z.object({ messageId: z.string().uuid(), quote: z.string().trim().min(3).max(500) }).strict()).min(1).max(3) }).strict()).max(12),
  unknowns: z.array(z.string().trim().min(1).max(300)).max(12),
  nextStep: z.string().trim().min(1).max(500),
}).strict();
export type AssistantConversationSummaryDto = z.infer<typeof assistantConversationSummarySchema>;
export type AssistantAgentResponseDto = z.infer<typeof assistantAgentResponseSchema>;
export type AssistantModelExecutionDto = {
  result: AssistantAgentResponseDto;
  usageInputTokens: number | null;
  usageOutputTokens: number | null;
  stopReason: import('./assistant-runtime.constants').AssistantStopReason;
  latencyMs: number;
};

export type AssistantRuntimeContextDto = {
  event: AssistantInboundEventDto;
  enabled: boolean;
  model: string;
  transcribeAudio: boolean;
  systemPrompt: string;
  operationMode: import('../channels/channels.dto').ChannelOperationMode;
  assistantScheduleMode: import('../channels/channels.dto').ChannelAssistantScheduleMode;
  businessHours: import('../channels/channels.dto').ChannelBusinessHourDto[];
  hasScheduleException: boolean;
  timeZone: string;
  automationMode: string;
  ownerUserId: string | null;
  recipientPhone: string;
  messages: AssistantRuntimeMessageDto[];
  audioAttachment: { id: string; status: string; storageKey: string | null; mimeType: string | null; fileName: string | null; sizeBytes: number | null } | null;
  audioTranscript: string | null;
};

export type AssistantQueueEventDto = { id: string; organizationId: string; payload: unknown; attempts: number };
