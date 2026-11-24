export const INBOX_COMPOSER_MODES = ['reply', 'note'] as const;
export const INBOX_COMPOSER_MODE = { reply: 'reply', note: 'note' } as const;
export const INBOX_DELIVERY_STATE = { failed: 'failed', unknown: 'unknown' } as const;
export const INBOX_AUDIO_MIME_PREFIX = 'audio/';
export const INBOX_AUDIO_PLAYER = {
  bars: 48,
  maxWaveformDurationSeconds: 300,
  minimumSeconds: 0,
  fallbackSeekMaximumSeconds: 1,
  minimumSampleCount: 1,
  secondsPerMinute: 60,
  secondsPerHour: 3600,
  timeDigits: 2,
  minBarHeightPercent: 12,
  maxBarHeightPercent: 100,
  seekStepSeconds: 0.1,
  emptyTime: '0:00',
} as const;
export const EMPTY_IDENTIFIER = '';
export const CAMPAIGN_DELIVERY_REVIEW_ALREADY_SENT_STATES: readonly string[] = ['accepted', 'delivered', 'read'];
export const CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE = 25;
