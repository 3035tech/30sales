export const MEDIA_ATTACHMENT_STALE_AFTER_MINUTES = 15;
export const MEDIA_ATTACHMENT_STALE_AFTER_MS = MEDIA_ATTACHMENT_STALE_AFTER_MINUTES * 60_000;
export const MEDIA_ATTACHMENT_ERROR_STAGE = {
  sourceValidation: 'source_validation',
  credentialsResolution: 'credentials_resolution',
  sourceDecryption: 'source_decryption',
  evolutionDownload: 'evolution_download',
  evolutionFetch: 'evolution_fetch',
  evolutionResponse: 'evolution_response',
  s3Upload: 's3_upload',
  databaseFinalize: 'database_finalize',
} as const;
export const MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR = 'MEDIA_PROVIDER_REJECTED';
