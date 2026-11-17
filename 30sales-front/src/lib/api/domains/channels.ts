import { request } from '../request';
import { z } from 'zod';
import { type CreateChannelInput, channelHealthCheckSchema, channelSchema, channelWebhookEventsPageSchema, evolutionConnectionSchema, evolutionInstanceListSchema, evolutionWebhookConfigurationSchema } from '../contracts';


export const channelsApi = {
    list: () => request('/api/v1/channels', z.array(channelSchema)),
    create: (input: CreateChannelInput) => request('/api/v1/channels', channelSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: { displayName?: string; isActive?: boolean; dailyMessageLimit?: number }) => request(`/api/v1/channels/${encodeURIComponent(id)}`, channelSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    setCredentials: (id: string, input: { provider: 'evolution'; baseUrl: string; apiKey: string; webhookSecret: string } | { provider: 'whatsapp_cloud_api'; accessToken: string; signalSecret: string }) => request(`/api/v1/channels/${encodeURIComponent(id)}/credentials`, channelSchema, { method: 'PUT', body: JSON.stringify(input) }),
    healthCheck: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/health-check`, channelHealthCheckSchema, { method: 'POST' }),
    discoverEvolutionInstances: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution-instances`, evolutionInstanceListSchema),
    configureEvolutionWebhook: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution-webhook/configure`, evolutionWebhookConfigurationSchema, { method: 'POST' }),
    connectEvolution: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/evolution/connect`, evolutionConnectionSchema, { method: 'POST' }),
    webhookEvents: (id: string, limit = 25, offset = 0) => request(`/api/v1/channels/${encodeURIComponent(id)}/events?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`, channelWebhookEventsPageSchema),
  };
