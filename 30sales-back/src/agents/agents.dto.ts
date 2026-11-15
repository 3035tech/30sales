import { z } from 'zod';

export const sofiaSettingsInputSchema = z.object({
  enabled: z.boolean(),
  systemPrompt: z.string().max(30000),
}).strict().superRefine((input, context) => {
  if (input.enabled && input.systemPrompt.trim().length < 100) context.addIssue({ code: 'custom', path: ['systemPrompt'], message: 'Add at least 100 characters of instructions before enabling Sofia.' });
});
export type SofiaSettingsInputDto = z.infer<typeof sofiaSettingsInputSchema>;

export class SofiaSettingsDto {
  constructor(readonly enabled: boolean, readonly model: string, readonly systemPrompt: string, readonly updatedAt: string | null, readonly runtimeAvailable = false) {}
}

export class SofiaSettingsRepositoryDto {
  constructor(readonly organizationId: string, readonly userId: string, readonly input: SofiaSettingsInputDto) {}
}
