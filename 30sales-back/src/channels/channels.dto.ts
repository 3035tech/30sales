import { z } from 'zod';

export const channelProviderSchema = z.enum(['evolution', 'whatsapp_cloud_api']);
export type ChannelProvider = z.infer<typeof channelProviderSchema>;
export const createChannelSchema = z.object({
  provider: channelProviderSchema,
  displayName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  providerChannelId: z.string().trim().min(1).max(200),
  providerAccountId: z.string().trim().max(200).optional(),
}).strict().superRefine((input, context) => {
  if (input.provider === 'whatsapp_cloud_api' && !input.providerAccountId) context.addIssue({ code: 'custom', path: ['providerAccountId'], message: 'A WhatsApp Business Account ID is required.' });
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;
export const updateChannelSchema = z.object({ displayName: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() }).strict().refine((input) => input.displayName !== undefined || input.isActive !== undefined);
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;
const evolutionCredentialsSchema = z.object({ provider: z.literal('evolution'), baseUrl: z.string().url(), apiKey: z.string().min(1).max(500), webhookSecret: z.string().min(32).max(500) }).strict();
const cloudApiCredentialsSchema = z.object({ provider: z.literal('whatsapp_cloud_api'), accessToken: z.string().min(1).max(4000), signalSecret: z.string().min(32).max(500).optional() }).strict();
export const channelCredentialsSchema = z.discriminatedUnion('provider', [evolutionCredentialsSchema, cloudApiCredentialsSchema]).superRefine((input, context) => {
  if (input.provider !== 'evolution') return;
  const url = new URL(input.baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) context.addIssue({ code: 'custom', path: ['baseUrl'], message: 'The Evolution API URL must be a secure HTTP(S) origin without credentials, query, or fragment.' });
});
export type ChannelCredentialsDto = z.infer<typeof channelCredentialsSchema>;
export const CHANNEL_HEALTH_STATUS = { notConfigured: 'not_configured', connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', reachable: 'reachable', credentialsInvalid: 'credentials_invalid', configurationError: 'configuration_error', unavailable: 'unavailable', unknown: 'unknown' } as const;
export const CHANNEL_HEALTH_STATUSES = [CHANNEL_HEALTH_STATUS.notConfigured, CHANNEL_HEALTH_STATUS.connected, CHANNEL_HEALTH_STATUS.connecting, CHANNEL_HEALTH_STATUS.disconnected, CHANNEL_HEALTH_STATUS.reachable, CHANNEL_HEALTH_STATUS.credentialsInvalid, CHANNEL_HEALTH_STATUS.configurationError, CHANNEL_HEALTH_STATUS.unavailable, CHANNEL_HEALTH_STATUS.unknown] as const;
export const channelHealthStatusSchema = z.enum(CHANNEL_HEALTH_STATUSES);
export type ChannelHealthStatus = z.infer<typeof channelHealthStatusSchema>;
export class ChannelHealthCheckDto {
  constructor(readonly status: ChannelHealthStatus, readonly checkedAt: string) {}
}
export class ChannelRecordDto {
  constructor(readonly id: string, readonly provider: ChannelProvider, readonly displayName: string, readonly phoneNumber: string, readonly providerChannelId: string, readonly providerAccountId: string | null, readonly isActive: boolean, readonly createdAt: string, readonly updatedAt: string, readonly isConfigured = false) {}
}
export class ChannelRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly input: CreateChannelDto, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryUpdateDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly input: UpdateChannelDto, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryCredentialsDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly provider: ChannelCredentialsDto['provider'], readonly encrypted: { ciphertext: string; iv: string; authTag: string }, readonly correlationId: string | null = null) {} }
export class ChannelHealthCheckTargetDto {
  constructor(readonly id: string, readonly provider: ChannelRecordDto['provider'], readonly providerChannelId: string, readonly isActive: boolean, readonly credentials: { ciphertext: string; iv: string; authTag: string } | null) {}
}
export class ChannelHealthCheckAuditDto {
  constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly status: ChannelHealthStatus, readonly checkedAt: Date, readonly correlationId: string | null) {}
}
