import { z } from 'zod';
import { CHANNEL_ASSISTANT_SCHEDULE_MODES, CHANNEL_CONNECTION_STATUSES, CHANNEL_OPERATION_MODES, CHANNEL_PROVIDER, CHANNEL_PROVIDERS, EVOLUTION_WEBHOOK_CONFIGURATION_STATUSES } from './channels.constants';
import { CHANNEL_DAILY_MESSAGE_LIMIT_MAX, CHANNEL_DAILY_MESSAGE_LIMIT_MIN } from './channels.constants';
import type { eventProcessingState } from '../db/schema';

export const channelProviderSchema = z.enum(CHANNEL_PROVIDERS);
export type ChannelProvider = z.infer<typeof channelProviderSchema>;
export const channelOperationModeSchema = z.enum(CHANNEL_OPERATION_MODES);
export type ChannelOperationMode = z.infer<typeof channelOperationModeSchema>;
export const channelAssistantScheduleModeSchema = z.enum(CHANNEL_ASSISTANT_SCHEDULE_MODES);
export type ChannelAssistantScheduleMode = z.infer<typeof channelAssistantScheduleModeSchema>;
export const channelBusinessHourSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/), endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) }).strict().refine((hours) => hours.startTime !== hours.endTime);
export type ChannelBusinessHourDto = z.infer<typeof channelBusinessHourSchema>;
const scheduleExceptionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
export const channelScheduleExceptionSchema = z.object({
  fromDate: scheduleExceptionDateSchema,
  toDate: scheduleExceptionDateSchema,
  assistantEnabled: z.boolean().optional(),
  startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
  endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
  weekdaySchedules: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), assistantEnabled: z.boolean(), startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable(), endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable(), endDayOffset: z.number().int().min(0).max(6) }).strict()).max(7).optional(),
}).strict().superRefine((exception, context) => {
  const days = (Date.parse(`${exception.toDate}T00:00:00.000Z`) - Date.parse(`${exception.fromDate}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days < 1 || days > 31) context.addIssue({ code: 'custom', path: ['toDate'], message: 'The exception date range must contain between one and 31 days.' });
  if (exception.weekdaySchedules) {
    if (exception.weekdaySchedules.length === 0 || new Set(exception.weekdaySchedules.map(({ dayOfWeek }) => dayOfWeek)).size !== exception.weekdaySchedules.length) context.addIssue({ code: 'custom', path: ['weekdaySchedules'], message: 'Choose at least one unique weekday.' });
    for (const [index, schedule] of exception.weekdaySchedules.entries()) {
      const hasStart = schedule.startTime !== null; const hasEnd = schedule.endTime !== null;
      if (hasStart !== hasEnd || (!schedule.assistantEnabled && (hasStart || hasEnd)) || (!hasStart && schedule.endDayOffset !== 0) || (schedule.assistantEnabled && hasStart && schedule.endDayOffset === 0 && schedule.startTime! >= schedule.endTime!)) context.addIssue({ code: 'custom', path: ['weekdaySchedules', index, 'startTime'], message: 'Provide a valid time range for this weekday.' });
    }
  } else {
    const hasStart = exception.startTime != null; const hasEnd = exception.endTime != null;
    if (exception.assistantEnabled === undefined || hasStart !== hasEnd || (!exception.assistantEnabled && (hasStart || hasEnd)) || (exception.startTime != null && exception.endTime != null && exception.startTime >= exception.endTime)) context.addIssue({ code: 'custom', path: ['startTime'], message: 'Provide a valid same-day interval only when the assistant is enabled.' });
  }
});
export type ChannelScheduleExceptionInputDto = z.infer<typeof channelScheduleExceptionSchema>;
export const createChannelSchema = z.object({
  provider: channelProviderSchema,
  displayName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  providerChannelId: z.string().trim().min(1).max(200),
  businessLineId: z.string().uuid(),
  providerAccountId: z.string().trim().max(200).optional(),
}).strict().superRefine((input, context) => {
  if (input.provider === 'whatsapp_cloud_api' && !input.providerAccountId) context.addIssue({ code: 'custom', path: ['providerAccountId'], message: 'A WhatsApp Business Account ID is required.' });
  if (input.provider === 'evolution' && !/^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/.test(input.providerChannelId)) context.addIssue({ code: 'custom', path: ['providerChannelId'], message: 'Evolution instance names must start with a letter or number and contain only letters, numbers, or hyphens.' });
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;
export const updateChannelSchema = z.object({ displayName: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional(), dailyMessageLimit: z.number().int().min(CHANNEL_DAILY_MESSAGE_LIMIT_MIN).max(CHANNEL_DAILY_MESSAGE_LIMIT_MAX).optional(), dailyLimitTimeZone: z.string().trim().min(1).max(80).optional(), operationMode: channelOperationModeSchema.optional(), assistantScheduleMode: channelAssistantScheduleModeSchema.optional(), inboundAssistantProfileId: z.string().uuid().nullable().optional(), outboundAssistantProfileId: z.string().uuid().nullable().optional(), businessHours: z.array(channelBusinessHourSchema).max(7).optional() }).strict().superRefine((input, context) => {
  if (input.dailyLimitTimeZone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: input.dailyLimitTimeZone }); }
    catch { context.addIssue({ code: 'custom', path: ['dailyLimitTimeZone'], message: 'Choose a valid time zone.' }); }
  }
  if (input.businessHours && new Set(input.businessHours.map(({ dayOfWeek }) => dayOfWeek)).size !== input.businessHours.length) context.addIssue({ code: 'custom', path: ['businessHours'], message: 'Each weekday can only have one schedule.' });
  if (input.businessHours !== undefined && input.operationMode !== 'outbound' && input.assistantScheduleMode !== undefined && input.assistantScheduleMode !== 'always' && input.assistantScheduleMode !== 'disabled' && input.businessHours.length === 0) context.addIssue({ code: 'custom', path: ['businessHours'], message: 'At least one business-hours window is required for scheduled assistant replies.' });
}).refine((input) => input.displayName !== undefined || input.isActive !== undefined || input.dailyMessageLimit !== undefined || input.dailyLimitTimeZone !== undefined || input.operationMode !== undefined || input.assistantScheduleMode !== undefined || input.inboundAssistantProfileId !== undefined || input.outboundAssistantProfileId !== undefined || input.businessHours !== undefined);
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
const configuredEvolutionCredentialsSchema = z.object({ provider: z.literal(CHANNEL_PROVIDER.evolution), webhookSecret: z.string().min(32).max(500).optional() }).strict();
export const configureChannelCredentialsSchema = z.union([configuredEvolutionCredentialsSchema, channelCredentialsSchema]);
export type ConfigureChannelCredentialsDto = z.infer<typeof configureChannelCredentialsSchema>;
export const platformEvolutionSecretsSchema = z.object({ apiKey: z.string().min(1).max(500) }).strict();
export const CHANNEL_HEALTH_STATUS = { notConfigured: 'not_configured', connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', reachable: 'reachable', credentialsInvalid: 'credentials_invalid', configurationError: 'configuration_error', unavailable: 'unavailable', unknown: 'unknown' } as const;
export const CHANNEL_HEALTH_STATUSES = [CHANNEL_HEALTH_STATUS.notConfigured, CHANNEL_HEALTH_STATUS.connected, CHANNEL_HEALTH_STATUS.connecting, CHANNEL_HEALTH_STATUS.disconnected, CHANNEL_HEALTH_STATUS.reachable, CHANNEL_HEALTH_STATUS.credentialsInvalid, CHANNEL_HEALTH_STATUS.configurationError, CHANNEL_HEALTH_STATUS.unavailable, CHANNEL_HEALTH_STATUS.unknown] as const;
export const channelHealthStatusSchema = z.enum(CHANNEL_HEALTH_STATUSES);
export type ChannelHealthStatus = z.infer<typeof channelHealthStatusSchema>;
export const evolutionWebhookConfigurationStatusSchema = z.enum(EVOLUTION_WEBHOOK_CONFIGURATION_STATUSES);
export type EvolutionWebhookConfigurationStatus = z.infer<typeof evolutionWebhookConfigurationStatusSchema>;
export class ChannelHealthCheckDto {
  constructor(readonly status: ChannelHealthStatus, readonly checkedAt: string) {}
}
export const channelMonitoringCheckSchema = z.object({ channelIds: z.array(z.string().uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length) }).strict();
export type ChannelMonitoringCheckInputDto = z.infer<typeof channelMonitoringCheckSchema>;
export class ChannelMonitoringStatusDto {
  constructor(readonly channelId: string, readonly status: ChannelHealthStatus, readonly checkedAt: string, readonly failedDeliveries: number, readonly webhookConfigurationStatus: EvolutionWebhookConfigurationStatus) {}
}
export class ChannelMonitoringCheckDto {
  constructor(readonly data: ChannelMonitoringStatusDto[], readonly checkedAt: string) {}
}
export const channelConnectionStatusSchema = z.enum(CHANNEL_CONNECTION_STATUSES);
export type ChannelConnectionStatus = z.infer<typeof channelConnectionStatusSchema>;
export class EvolutionInstanceListDto { constructor(readonly channelId: string, readonly instances: import('./evolution-instance-discovery.provider').EvolutionInstanceDiscoveryDto[]) {} }
export class EvolutionWebhookConfigurationDto { constructor(readonly configured: true, readonly configuredAt: string) {} }
export const channelWebhookEventsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0), status: z.enum(['pending', 'processing', 'processed', 'failed']).optional(), eventFamily: z.string().trim().min(1).max(40).optional(), search: z.string().trim().min(1).max(120).optional() }).strict();
export type ChannelWebhookEventsQueryDto = z.infer<typeof channelWebhookEventsQuerySchema>;
export class ChannelWebhookEventRecordDto {
  constructor(readonly id: string, readonly provider: string, readonly eventType: string, readonly eventFamily: string, readonly status: typeof eventProcessingState.enumValues[number], readonly attempts: number, readonly receivedAt: string, readonly processedAt: string | null, readonly lastErrorCode: string | null, readonly correlationId: string | null) {}
}
export class ChannelWebhookEventsPageDto {
  constructor(readonly data: ChannelWebhookEventRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
export class ChannelWebhookEventRetryDto { constructor(readonly organizationId: string, readonly channelId: string, readonly eventId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly correlationId: string | null) {} }
export class ChannelWebhookEventRetryResultDto { constructor(readonly queued: true) {} }
export class ChannelConnectionStatusUpdateDto {
  constructor(readonly organizationId: string, readonly channelId: string, readonly status: ChannelConnectionStatus, readonly updatedAt: Date) {}
}
export class ChannelRecordDto {
  constructor(readonly id: string, readonly provider: ChannelProvider, readonly displayName: string, readonly phoneNumber: string, readonly providerChannelId: string, readonly providerAccountId: string | null, readonly isActive: boolean, readonly dailyMessageLimit: number, readonly dailyLimitTimeZone: string, readonly dailyMessageCount: number, readonly createdAt: string, readonly updatedAt: string, readonly isConfigured = false, readonly connectionStatus: ChannelConnectionStatus | null = null, readonly connectionUpdatedAt: string | null = null, readonly operationMode: ChannelOperationMode = 'hybrid', readonly assistantScheduleMode: ChannelAssistantScheduleMode = 'always', readonly businessHours: ChannelBusinessHourDto[] = [], readonly businessLineId: string | null = null, readonly businessLineName: string | null = null, readonly scheduleExceptions: ChannelScheduleExceptionDto[] = [], readonly inboundAssistantProfileId: string | null = null, readonly outboundAssistantProfileId: string | null = null, readonly hasEverConnected = false) {}
}
export class ChannelScheduleExceptionDto {
  constructor(readonly id: string, readonly localDate: string, readonly assistantEnabled: boolean, readonly startTime: string | null, readonly endTime: string | null, readonly endDayOffset: number | null = null) {}
}
export class ChannelRepositoryScheduleExceptionDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly input: ChannelScheduleExceptionInputDto, readonly correlationId: string | null) {} }
export class ChannelRepositoryDeleteScheduleExceptionDto { constructor(readonly organizationId: string, readonly channelId: string, readonly exceptionId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly correlationId: string | null) {} }
export class ChannelRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly input: CreateChannelDto, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryUpdateDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly input: UpdateChannelDto, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryDeleteDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly remoteInstanceDeleted: boolean, readonly correlationId: string | null = null) {} }
export class ChannelRepositoryCredentialsDto { constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly provider: ChannelCredentialsDto['provider'], readonly encrypted: { ciphertext: string; iv: string; authTag: string }, readonly correlationId: string | null = null) {} }
export class ChannelHealthCheckTargetDto {
  constructor(readonly id: string, readonly provider: ChannelRecordDto['provider'], readonly providerChannelId: string, readonly isActive: boolean, readonly credentials: { ciphertext: string; iv: string; authTag: string } | null) {}
}
export class ChannelHealthCheckAuditDto {
  constructor(readonly organizationId: string, readonly channelId: string, readonly actorUserId: string, readonly canManageAllLines: boolean, readonly status: ChannelHealthStatus, readonly checkedAt: Date, readonly correlationId: string | null) {}
}
