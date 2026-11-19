import { z } from 'zod';

export const assistantSettingsInputSchema = z.object({
  businessLineId: z.string().uuid().nullable().optional(),
  enabled: z.boolean(),
  model: z.enum(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']),
  transcribeAudio: z.boolean(),
  systemPrompt: z.string().max(30000),
}).strict().superRefine((input, context) => {
  if (input.enabled && input.systemPrompt.trim().length < 100) context.addIssue({ code: 'custom', path: ['systemPrompt'], message: 'Add at least 100 characters of instructions before enabling Assistant.' });
});
export const assistantBusinessLineIdSchema = z.string().uuid().optional();
export type AssistantSettingsInputDto = z.infer<typeof assistantSettingsInputSchema>;

export class AssistantSettingsDto {
  readonly availableModels = [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', provider: 'Anthropic' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'Anthropic' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'Anthropic' },
  ];
  constructor(readonly enabled: boolean, readonly model: string, readonly transcribeAudio: boolean, readonly systemPrompt: string, readonly updatedAt: string | null, readonly runtimeAvailable = false, readonly transcriptionAvailable = false, readonly businessLineId: string | null = null, readonly businessLineName: string | null = null, readonly inherited = false) {}
}

export class AssistantSettingsRepositoryDto {
  constructor(readonly organizationId: string, readonly userId: string, readonly input: AssistantSettingsInputDto, readonly businessLineId: string | null = input.businessLineId ?? null, readonly correlationId: string | null = null) {}
}
