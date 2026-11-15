import { z } from 'zod';

export const assistantSettingsInputSchema = z.object({
  enabled: z.boolean(),
  systemPrompt: z.string().max(30000),
}).strict().superRefine((input, context) => {
  if (input.enabled && input.systemPrompt.trim().length < 100) context.addIssue({ code: 'custom', path: ['systemPrompt'], message: 'Add at least 100 characters of instructions before enabling Assistant.' });
});
export type AssistantSettingsInputDto = z.infer<typeof assistantSettingsInputSchema>;

export class AssistantSettingsDto {
  constructor(readonly enabled: boolean, readonly model: string, readonly systemPrompt: string, readonly updatedAt: string | null, readonly runtimeAvailable = false) {}
}

export class AssistantSettingsRepositoryDto {
  constructor(readonly organizationId: string, readonly userId: string, readonly input: AssistantSettingsInputDto) {}
}
