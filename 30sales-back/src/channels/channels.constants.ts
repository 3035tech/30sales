export const CHANNEL_PROVIDER = {
  evolution: 'evolution',
  whatsappCloudApi: 'whatsapp_cloud_api',
} as const;

export const CHANNEL_PROVIDERS = Object.values(CHANNEL_PROVIDER);
export const CHANNEL_DAILY_MESSAGE_LIMIT_DEFAULT = 500;
export const CHANNEL_DAILY_MESSAGE_LIMIT_MIN = 1;
export const CHANNEL_DAILY_MESSAGE_LIMIT_MAX = 5000;
export const CHANNEL_DAILY_LIMIT_TIME_ZONE_DEFAULT = 'America/Sao_Paulo';
export const CHANNEL_CONNECTION_STATUS = { connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', unknown: 'unknown' } as const;
export const CHANNEL_CONNECTION_STATUSES = Object.values(CHANNEL_CONNECTION_STATUS);
export const CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES = [CHANNEL_CONNECTION_STATUS.connecting, CHANNEL_CONNECTION_STATUS.disconnected] as const;
export const CHANNEL_CONNECTION_ERROR = { unavailable: 'CHANNEL_CONNECTION_UNAVAILABLE' } as const;
export const CHANNEL_MESSAGE_QUOTA_ERROR = { dailyLimitReached: 'CHANNEL_DAILY_MESSAGE_LIMIT_REACHED' } as const;
export const CHANNEL_AUDIT_ACTION = { evolutionWebhookConfigured: 'channel.evolution_webhook_configured', evolutionConnectionRequested: 'channel.evolution_connection_requested' } as const;
export const CHANNEL_EVENT_ERROR_FALLBACK = 'PROVIDER_EVENT_FAILED';
export const CHANNEL_QUOTA_COUNTED_DIRECTION = 'outbound';
export const CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE = 'failed';
