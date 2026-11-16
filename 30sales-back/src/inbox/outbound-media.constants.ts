export const OUTBOUND_MEDIA_LIMIT_BYTES = 16 * 1024 * 1024;

export const OUTBOUND_MEDIA_TYPE = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
} as const;

export const OUTBOUND_MEDIA_ATTACHMENT_STATUS = {
  pending: 'pending',
  available: 'available',
  failed: 'failed',
} as const;

export const OUTBOUND_MEDIA_MIME_TYPE = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4Video: 'video/mp4',
  threeGppVideo: 'video/3gpp',
  pdf: 'application/pdf',
  mpegAudio: 'audio/mpeg',
  aacAudio: 'audio/aac',
  oggAudio: 'audio/ogg',
  amrAudio: 'audio/amr',
  mp4Audio: 'audio/mp4',
  wavAudio: 'audio/wav',
} as const;

export const OUTBOUND_MEDIA_ALLOWED_MIME_TYPES = Object.values(OUTBOUND_MEDIA_MIME_TYPE);

export const OUTBOUND_MEDIA_ERROR = {
  missing: 'MEDIA_FILE_REQUIRED',
  tooLarge: 'MEDIA_SIZE_LIMIT_EXCEEDED',
  unsupportedType: 'MEDIA_TYPE_UNSUPPORTED',
  invalidContent: 'MEDIA_CONTENT_INVALID',
  storageFailed: 'MEDIA_STORAGE_FAILED',
  audioCaptionUnsupported: 'MEDIA_AUDIO_CAPTION_UNSUPPORTED',
} as const;
