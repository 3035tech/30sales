import { z } from 'zod';

export const channelProviderSchema = z.enum(['evolution', 'whatsapp_cloud_api']);
export const createChannelSchema = z.object({
  provider: channelProviderSchema,
  displayName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  providerChannelId: z.string().trim().min(1).max(200),
  providerAccountId: z.string().trim().max(200).optional(),
  chatwootInboxId: z.string().trim().max(200).optional(),
}).strict().superRefine((input, context) => {
  if (input.provider === 'whatsapp_cloud_api' && !input.providerAccountId) context.addIssue({ code: 'custom', path: ['providerAccountId'], message: 'A WhatsApp Business Account ID is required.' });
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;
export const updateChannelSchema = z.object({ displayName: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() }).strict().refine((input) => input.displayName !== undefined || input.isActive !== undefined);
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;
export class ChannelRecordDto {
  constructor(readonly id: string, readonly provider: (typeof channelProviderSchema.enumValues)[number], readonly displayName: string, readonly phoneNumber: string, readonly providerChannelId: string, readonly providerAccountId: string | null, readonly chatwootInboxId: string | null, readonly isActive: boolean, readonly createdAt: string, readonly updatedAt: string) {}
}
export class ChannelRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly input: CreateChannelDto, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryUpdateDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly input: UpdateChannelDto, readonly correlationId: string | null = null) {} }
