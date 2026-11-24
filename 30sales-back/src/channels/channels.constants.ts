export const CHANNEL_PROVIDER = {
  evolution: 'evolution',
  whatsappCloudApi: 'whatsapp_cloud_api',
} as const;

export const CHANNEL_PROVIDERS = Object.values(CHANNEL_PROVIDER);
export const CHANNEL_OPERATION_MODE = { inbound: 'inbound', outbound: 'outbound', hybrid: 'hybrid' } as const;
export const CHANNEL_OPERATION_MODES = Object.values(CHANNEL_OPERATION_MODE);
export const CHANNEL_ASSISTANT_SCHEDULE_MODE = { always: 'always', businessHours: 'business_hours', afterHours: 'after_hours', disabled: 'disabled' } as const;
export const CHANNEL_ASSISTANT_SCHEDULE_MODES = Object.values(CHANNEL_ASSISTANT_SCHEDULE_MODE);
export const CHANNEL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const CHANNEL_DAILY_MESSAGE_LIMIT_DEFAULT = 500;
export const CHANNEL_DAILY_MESSAGE_LIMIT_MIN = 1;
export const CHANNEL_DAILY_MESSAGE_LIMIT_MAX = 5000;
export const CHANNEL_DAILY_LIMIT_TIME_ZONE_DEFAULT = 'America/Sao_Paulo';
export const CHANNEL_CONNECTION_STATUS = { connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', unknown: 'unknown' } as const;
export const CHANNEL_CONNECTION_STATUSES = Object.values(CHANNEL_CONNECTION_STATUS);
export const CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES = [CHANNEL_CONNECTION_STATUS.connecting, CHANNEL_CONNECTION_STATUS.disconnected] as const;
export const CHANNEL_CONNECTION_ERROR = { unavailable: 'CHANNEL_CONNECTION_UNAVAILABLE' } as const;
export const CHANNEL_MESSAGE_QUOTA_ERROR = { dailyLimitReached: 'CHANNEL_DAILY_MESSAGE_LIMIT_REACHED' } as const;
export const CHANNEL_AUDIT_ACTION = { evolutionWebhookConfigured: 'channel.evolution_webhook_configured', evolutionConnectionRequested: 'channel.evolution_connection_requested', evolutionWebhookEventRequeued: 'channel.evolution_webhook_event_requeued' } as const;
export const CHANNEL_WEBHOOK_EVENT_RETRY = { attempts: 0, resultQueued: true } as const;
export const EVOLUTION_WEBHOOK_CONFIGURATION_STATUS = { confirmed: 'confirmed', drifted: 'drifted', notConfigured: 'not_configured', notChecked: 'not_checked', unavailable: 'unavailable' } as const;
export const EVOLUTION_WEBHOOK_CONFIGURATION_STATUSES = Object.values(EVOLUTION_WEBHOOK_CONFIGURATION_STATUS);
export const CHANNEL_MONITORING_CHECK_CONCURRENCY = 5;
export const CHANNEL_EVENT_ERROR_FALLBACK = 'PROVIDER_EVENT_FAILED';
export const CHANNEL_QUOTA_COUNTED_DIRECTION = 'outbound';
export const CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE = 'failed';
