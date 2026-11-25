// Operational safety cap: Evolution does not publish a fixed inbound media limit.
export const MAX_EVOLUTION_INBOUND_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_EVOLUTION_MEDIA_RESPONSE_BYTES = 140 * 1024 * 1024;

// Meta Cloud API allows inbound media messages up to 100 MB overall; per-type caps can be lower.
export const MAX_META_CLOUD_INBOUND_MEDIA_BYTES = 100 * 1024 * 1024;
