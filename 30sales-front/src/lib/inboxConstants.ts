export const INBOX_COMPOSER_MODES = ['reply', 'note'] as const;
export const INBOX_COMPOSER_MODE = { reply: 'reply', note: 'note' } as const;
export const INBOX_DELIVERY_STATE = { failed: 'failed', unknown: 'unknown' } as const;
export const INBOX_AUDIO_MIME_PREFIX = 'audio/';
export const EMPTY_IDENTIFIER = '';
export const CAMPAIGN_DELIVERY_REVIEW_ALREADY_SENT_STATES: readonly string[] = ['accepted', 'delivered', 'read'];
export const CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE = 25;
