export const CHANNEL_PROVIDER = { evolution: 'evolution', whatsappCloudApi: 'whatsapp_cloud_api' } as const;
export const CHANNEL_WEBHOOK_EVENT = { unmatchedMessageStatus: 'messages.status.unmatched' } as const;
export const CHANNEL_WEBHOOK_EVENT_RETRY_ERROR = { unmatchedStatus: 'EVOLUTION_MESSAGE_STATUS_UNMATCHED' } as const;
export const EVOLUTION_WEBHOOK_CONFIGURATION_STATUS = {
  confirmed: 'confirmed',
  drifted: 'drifted',
  notConfigured: 'not_configured',
  notChecked: 'not_checked',
  unavailable: 'unavailable',
} as const;

export const EVOLUTION_WEBHOOK_CONFIGURATION_STATUSES = Object.values(EVOLUTION_WEBHOOK_CONFIGURATION_STATUS);
