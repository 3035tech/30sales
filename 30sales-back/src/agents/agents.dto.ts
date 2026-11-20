import { z } from 'zod';

export const assistantProfileDirectionSchema = z.enum(['inbound', 'outbound']);
const assistantModelSchema = z.enum(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
export const assistantProfileInputSchema = z.object({ businessLineId: z.string().uuid(), direction: assistantProfileDirectionSchema, name: z.string().trim().min(2).max(120), enabled: z.boolean(), model: assistantModelSchema, transcribeAudio: z.boolean(), systemPrompt: z.string().max(30000) }).strict().superRefine((input, context) => {
  if (input.enabled && input.systemPrompt.trim().length < 100) context.addIssue({ code: 'custom', path: ['systemPrompt'], message: 'Add at least 100 characters of instructions before enabling this profile.' });
});
export type AssistantProfileInputDto = z.infer<typeof assistantProfileInputSchema>;
export class AssistantProfileDto {
  readonly availableModels = [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', provider: 'Anthropic' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'Anthropic' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'Anthropic' },
  ];
  constructor(readonly id: string, readonly businessLineId: string, readonly direction: 'inbound' | 'outbound', readonly name: string, readonly enabled: boolean, readonly model: string, readonly transcribeAudio: boolean, readonly systemPrompt: string, readonly updatedAt: string) {}
}
export class AssistantProfileRepositoryDto { constructor(readonly organizationId: string, readonly userId: string, readonly input: AssistantProfileInputDto, readonly profileId: string | null = null, readonly correlationId: string | null = null) {} }

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
