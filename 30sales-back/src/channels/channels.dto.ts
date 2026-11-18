import { z } from 'zod';
import { CHANNEL_CONNECTION_STATUSES, CHANNEL_PROVIDER, CHANNEL_PROVIDERS } from './channels.constants';
import { CHANNEL_DAILY_MESSAGE_LIMIT_MAX, CHANNEL_DAILY_MESSAGE_LIMIT_MIN } from './channels.constants';
import type { eventProcessingState } from '../db/schema';

export const channelProviderSchema = z.enum(CHANNEL_PROVIDERS);
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
export const updateChannelSchema = z.object({ displayName: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional(), dailyMessageLimit: z.number().int().min(CHANNEL_DAILY_MESSAGE_LIMIT_MIN).max(CHANNEL_DAILY_MESSAGE_LIMIT_MAX).optional(), dailyLimitTimeZone: z.string().trim().min(1).max(80).optional() }).strict().superRefine((input, context) => {
  if (input.dailyLimitTimeZone === undefined) return;
  try { new Intl.DateTimeFormat('en', { timeZone: input.dailyLimitTimeZone }); }
  catch { context.addIssue({ code: 'custom', path: ['dailyLimitTimeZone'], message: 'Choose a valid time zone.' }); }
}).refine((input) => input.displayName !== undefined || input.isActive !== undefined || input.dailyMessageLimit !== undefined || input.dailyLimitTimeZone !== undefined);
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;
const evolutionCredentialsSchema = z.object({ provider: z.literal(CHANNEL_PROVIDER.evolution), baseUrl: z.string().url(), apiKey: z.string().min(1).max(500), webhookSecret: z.string().min(32).max(500) }).strict();
const cloudApiCredentialsSchema = z.object({ provider: z.literal(CHANNEL_PROVIDER.whatsappCloudApi), accessToken: z.string().min(1).max(4000), signalSecret: z.string().min(32).max(500).optional() }).strict();
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
export const channelMonitoringCheckSchema = z.object({ channelIds: z.array(z.string().uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length) }).strict();
export type ChannelMonitoringCheckInputDto = z.infer<typeof channelMonitoringCheckSchema>;
export class ChannelMonitoringStatusDto {
  constructor(readonly channelId: string, readonly status: ChannelHealthStatus, readonly checkedAt: string, readonly failedDeliveries: number) {}
}
export class ChannelMonitoringCheckDto {
  constructor(readonly data: ChannelMonitoringStatusDto[], readonly checkedAt: string) {}
}
export const channelConnectionStatusSchema = z.enum(CHANNEL_CONNECTION_STATUSES);
export type ChannelConnectionStatus = z.infer<typeof channelConnectionStatusSchema>;
export class EvolutionInstanceListDto { constructor(readonly channelId: string, readonly instances: import('./evolution-instance-discovery.provider').EvolutionInstanceDiscoveryDto[]) {} }
export class EvolutionWebhookConfigurationDto { constructor(readonly configured: true, readonly configuredAt: string) {} }
export const channelWebhookEventsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ChannelWebhookEventsQueryDto = z.infer<typeof channelWebhookEventsQuerySchema>;
export class ChannelWebhookEventRecordDto {
  constructor(readonly id: string, readonly provider: string, readonly eventType: string, readonly eventFamily: string, readonly status: typeof eventProcessingState.enumValues[number], readonly attempts: number, readonly receivedAt: string, readonly processedAt: string | null, readonly lastErrorCode: string | null) {}
}
export class ChannelWebhookEventsPageDto {
  constructor(readonly data: ChannelWebhookEventRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
export class ChannelConnectionStatusUpdateDto {
  constructor(readonly organizationId: string, readonly channelId: string, readonly status: ChannelConnectionStatus, readonly updatedAt: Date) {}
}
export class ChannelRecordDto {
  constructor(readonly id: string, readonly provider: ChannelProvider, readonly displayName: string, readonly phoneNumber: string, readonly providerChannelId: string, readonly providerAccountId: string | null, readonly isActive: boolean, readonly dailyMessageLimit: number, readonly dailyLimitTimeZone: string, readonly dailyMessageCount: number, readonly createdAt: string, readonly updatedAt: string, readonly isConfigured = false, readonly connectionStatus: ChannelConnectionStatus | null = null, readonly connectionUpdatedAt: string | null = null) {}
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
