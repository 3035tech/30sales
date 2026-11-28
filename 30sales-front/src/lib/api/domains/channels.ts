import { request } from '../request';
import { z } from 'zod';
import { type ChannelWebhookEventFamily, type ChannelWebhookEventStatus, type CreateChannelInput, channelHealthCheckSchema, channelMediaHealthSchema, channelMonitoringCheckSchema, channelScheduleExceptionSchema, channelSchema, channelWebhookEventRetrySchema, channelWebhookEventsPageSchema, evolutionConnectionSchema, evolutionInstanceListSchema, evolutionWebhookConfigurationSchema } from '../contracts';


export const channelsApi = {
    list: (businessLineId?: string) => request(`/api/v1/channels${businessLineId ? `?${new URLSearchParams({ businessLineId })}` : ''}`, z.array(channelSchema)),
    create: (input: CreateChannelInput) => request('/api/v1/channels', channelSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: { displayName?: string; isActive?: boolean; dailyMessageLimit?: number; dailyLimitTimeZone?: string; operationMode?: 'inbound' | 'outbound' | 'hybrid'; assistantScheduleMode?: 'always' | 'business_hours' | 'after_hours' | 'disabled'; inboundAssistantProfileId?: string | null; outboundAssistantProfileId?: string | null; activityOwnerUserId?: string | null; dailyNewContactGoal?: number | null; dailyContinuationGoal?: number | null; businessHours?: Array<{ dayOfWeek: number; startTime: string; endTime: string }> }) => request(`/api/v1/channels/${encodeURIComponent(id)}`, channelSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    transferBusinessLine: (id: string, businessLineId: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/business-line`, channelSchema, { method: 'PATCH', body: JSON.stringify({ businessLineId }) }),
    delete: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}`, z.object({ deleted: z.literal(true), historyPreserved: z.literal(true), remoteInstanceDeleted: z.boolean() }), { method: 'DELETE' }),
    saveScheduleException: (id: string, input: { fromDate: string; toDate: string; weekdaySchedules: Array<{ dayOfWeek: number; assistantEnabled: boolean; startTime: string | null; endTime: string | null; endDayOffset: number }> }) => request(`/api/v1/channels/${encodeURIComponent(id)}/schedule-exceptions`, z.array(channelScheduleExceptionSchema), { method: 'PUT', body: JSON.stringify(input) }),
    deleteScheduleException: (id: string, exceptionId: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/schedule-exceptions/${encodeURIComponent(exceptionId)}`, z.object({ deleted: z.literal(true) }), { method: 'DELETE' }),
    setCredentials: (id: string, input: { provider: 'evolution'; webhookSecret?: string } | { provider: 'evolution'; baseUrl: string; apiKey: string; webhookSecret: string } | { provider: 'whatsapp_cloud_api'; accessToken: string; signalSecret: string }) => request(`/api/v1/channels/${encodeURIComponent(id)}/credentials`, channelSchema, { method: 'PUT', body: JSON.stringify(input) }),
    healthCheck: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/health-check`, channelHealthCheckSchema, { method: 'POST' }),
    monitoringCheck: (channelIds: string[]) => request('/api/v1/channels/monitoring/check', channelMonitoringCheckSchema, { method: 'POST', body: JSON.stringify({ channelIds }) }),
    discoverEvolutionInstances: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution-instances`, evolutionInstanceListSchema),
    configureEvolutionWebhook: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution-webhook/configure`, evolutionWebhookConfigurationSchema, { method: 'POST' }),
    connectEvolution: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution/connect`, evolutionConnectionSchema, { method: 'POST' }),
    webhookEvents: (id: string, limit = 25, offset = 0, filters: { status?: ChannelWebhookEventStatus; eventFamily?: ChannelWebhookEventFamily; search?: string } = {}) => request(`/api/v1/channels/${encodeURIComponent(id)}/events?${new URLSearchParams({ limit: String(limit), offset: String(offset), ...filters })}`, channelWebhookEventsPageSchema),
    mediaHealth: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/media-health`, channelMediaHealthSchema),
    retryWebhookEvent: (id: string, eventId: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}/retry`, channelWebhookEventRetrySchema, { method: 'POST' }),
  };
