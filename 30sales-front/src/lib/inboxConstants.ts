export const INBOX_COMPOSER_MODES = ['reply', 'note'] as const;
export const INBOX_COMPOSER_MODE = { reply: 'reply', note: 'note' } as const;
export const INBOX_DELIVERY_STATE = { failed: 'failed', unknown: 'unknown' } as const;
export const INBOX_AUDIO_MIME_PREFIX = 'audio/';
export const INBOX_ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/3gpp',
  'application/pdf',
  'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/amr', 'audio/mp4', 'audio/wav', 'audio/webm',
].join(',');
export const INBOX_AUDIO_RECORDING = {
  mimeTypes: ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'] as const,
  mimeTypeExtensions: { 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a' } as const,
  waveformSampleBytes: 2048,
  waveformRefreshMilliseconds: 100,
  millisecondsPerSecond: 1000,
  minimumWaveformHeightPercent: 10,
  maximumWaveformHeightPercent: 100,
  sampleCenter: 128,
  waveformAmplitudeScale: 3,
} as const;
export const INBOX_AUDIO_PLAYER = {
  bars: 48,
  compactBars: 28,
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
