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
