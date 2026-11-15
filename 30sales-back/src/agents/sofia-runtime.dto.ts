import { z } from 'zod';

export const sofiaInboundEventSchema = z.object({
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
export type SofiaInboundEventDto = z.infer<typeof sofiaInboundEventSchema>;

export type SofiaRuntimeMessageDto = { role: 'user' | 'assistant'; content: string };
export const sofiaAgentResponseSchema = z.object({
  replyText: z.string().trim().min(1).max(4096),
  intent: z.enum(['qualification', 'information_request', 'explicit_human_request', 'meeting_request', 'proposal_request', 'not_interested', 'unclear']),
  summary: z.string().trim().min(1).max(1000),
  confirmedFacts: z.array(z.string().trim().min(1).max(300)).max(12),
  unknowns: z.array(z.string().trim().min(1).max(300)).max(12),
  nextStep: z.string().trim().min(1).max(500),
}).strict();
export type SofiaAgentResponseDto = z.infer<typeof sofiaAgentResponseSchema>;

export type SofiaRuntimeContextDto = {
  event: SofiaInboundEventDto;
  enabled: boolean;
  model: string;
  systemPrompt: string;
  automationMode: string;
  ownerUserId: string | null;
  recipientPhone: string;
  messages: SofiaRuntimeMessageDto[];
};

export type SofiaQueueEventDto = { id: string; organizationId: string; payload: unknown; attempts: number };
