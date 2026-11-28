import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { InboundMediaAdapter, InboundMediaAdapterInput, MediaDownloadResult } from './inbound-media-adapter';
import { MAX_EVOLUTION_INBOUND_MEDIA_BYTES, MAX_EVOLUTION_MEDIA_RESPONSE_BYTES } from './media-limits.constants';
import { MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR } from './media-attachment.constants';

const sourceSchema = z.object({ key: z.record(z.string(), z.unknown()), message: z.record(z.string(), z.unknown()) });
const responseSchema = z.object({ base64: z.string(), mimetype: z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:\s*;\s*codecs=[a-z0-9._,-]+)?$/i).optional(), fileName: z.string().max(255).optional() });
type EvolutionResponseVariant = 'full_message' | 'message_key';
type EvolutionResponseOutcome = 'accepted' | 'invalid' | 'rejected' | 'transport_error';

const CIRCUIT_OPEN_THRESHOLD = 3;
const CIRCUIT_OPEN_DURATION_MS = 5 * 60_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 45_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 20_000;
const SAFE_TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

function safeTransportCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object' || !('code' in cause) || typeof cause.code !== 'string') return null;
  return SAFE_TRANSPORT_CODES.has(cause.code) ? cause.code : null;
}

@Injectable()
export class EvolutionInboundMediaAdapter implements InboundMediaAdapter {
  readonly provider = 'evolution' as const;
  private readonly logger = new Logger(EvolutionInboundMediaAdapter.name);
  private readonly circuitBreakers = new Map<string, { transportErrors: number; openUntil: number | null }>();

  private getCircuit(providerChannelId: string): { transportErrors: number; openUntil: number | null } {
    let circuit = this.circuitBreakers.get(providerChannelId);
    if (!circuit) { circuit = { transportErrors: 0, openUntil: null }; this.circuitBreakers.set(providerChannelId, circuit); }
    return circuit;
  }

  async download(input: InboundMediaAdapterInput): Promise<MediaDownloadResult> {
    const circuit = this.getCircuit(input.providerChannelId);
    if (circuit.openUntil !== null) {
      if (Date.now() < circuit.openUntil) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
      circuit.openUntil = null;
      circuit.transportErrors = 0;
    }
    const credentials = this.credentials(input.credentials);
    const source = sourceSchema.safeParse(JSON.parse(input.sourcePayload) as unknown);
    if (!source.success) throw new Error('MEDIA_SOURCE_INVALID');
    const url = new URL(credentials.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(input.providerChannelId)}`;
    url.search = '';
    url.hash = '';
    await assertPublicEvolutionTarget(url.toString());
    const payloads = [{ message: source.data, convertToMp4: false }, { message: { key: source.data.key }, convertToMp4: false }];
    let parsedMedia: z.infer<typeof responseSchema> | null = null;
    let providerResponded = false;
    let providerRejected = false;
    let transportFailed = false;
    const timeoutMs = input.mediaType === 'video' ? VIDEO_DOWNLOAD_TIMEOUT_MS : DEFAULT_DOWNLOAD_TIMEOUT_MS;
    for (const [index, payload] of payloads.entries()) {
      const requestVariant: EvolutionResponseVariant = index === 0 ? 'full_message' : 'message_key';
      const requestStartedAt = Date.now();
      let receivedHeaders = false;
      try {
        const response = await fetch(url, { method: 'POST', headers: { apikey: credentials.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
        receivedHeaders = true;
        providerResponded = true;
        const contentType = this.safeContentType(response.headers.get('content-type'));
        if (!response.ok) {
          providerRejected = true;
          this.logResponse(input, requestVariant, 'rejected', requestStartedAt, { statusCode: response.status, contentType });
          continue;
        }
        if (!response.body) {
          this.logResponse(input, requestVariant, 'invalid', requestStartedAt, { statusCode: response.status, contentType, failureReason: 'body_missing' });
          continue;
        }
        const raw = await this.readBytes(response, MAX_EVOLUTION_MEDIA_RESPONSE_BYTES);
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw.toString('utf8')) as unknown;
        } catch {
          this.logResponse(input, requestVariant, 'invalid', requestStartedAt, { statusCode: response.status, contentType, responseBytes: raw.byteLength, failureReason: 'invalid_json' });
          continue;
        }
        const parsed = responseSchema.safeParse(decoded);
        if (!parsed.success) {
          const shape = this.responseShape(decoded);
          const invalidFields = parsed.error.issues.map((issue) => issue.path[0]).filter((field): field is string =>
            field === 'base64' || field === 'mimetype' || field === 'fileName');
          this.logResponse(input, requestVariant, 'invalid', requestStartedAt, { statusCode: response.status, contentType, responseBytes: raw.byteLength,
            failureReason: shape.base64Type === 'missing' ? 'base64_missing' : shape.base64Type !== 'string' ? 'base64_not_string'
              : invalidFields.includes('mimetype') ? 'mimetype_invalid' : invalidFields.includes('fileName') ? 'file_name_invalid' : 'response_schema_invalid',
            invalidFields, ...shape });
          continue;
        }
        const encoded = parsed.data.base64.replace(/^data:[^;,]+;base64,/i, '');
        if (!encoded.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
          this.logResponse(input, requestVariant, 'invalid', requestStartedAt, { statusCode: response.status, contentType, responseBytes: raw.byteLength,
            failureReason: encoded.length ? 'base64_invalid' : 'base64_empty', base64Length: encoded.length });
          continue;
        }
        parsedMedia = parsed.data;
        this.logResponse(input, requestVariant, 'accepted', requestStartedAt, { statusCode: response.status, contentType, responseBytes: raw.byteLength, base64Length: encoded.length });
        break;
      } catch (error) {
        if (error instanceof Error && error.message === 'MEDIA_SIZE_LIMIT_EXCEEDED') throw error;
        transportFailed = true;
        const transportCode = safeTransportCode(error);
        const failureReason = error instanceof Error && error.name === 'TimeoutError' || transportCode?.includes('TIMEOUT') || transportCode === 'ETIMEDOUT'
          ? 'timeout' : receivedHeaders ? 'response_read_error' : 'network_error';
        this.logResponse(input, requestVariant, 'transport_error', requestStartedAt, { failureReason, ...(transportCode ? { transportCode } : {}) });
        continue;
      }
    }
    if (!parsedMedia) {
      const errorCode = providerRejected ? MEDIA_ATTACHMENT_PROVIDER_REJECTED_ERROR : transportFailed || !providerResponded ? 'MEDIA_PROVIDER_UNAVAILABLE' : 'MEDIA_PROVIDER_RESPONSE_INVALID';
      if (errorCode === 'MEDIA_PROVIDER_UNAVAILABLE') {
        circuit.transportErrors += 1;
        if (circuit.transportErrors >= CIRCUIT_OPEN_THRESHOLD) {
          circuit.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
          this.logger.warn(JSON.stringify({ event: 'evolution_media_circuit_open', providerChannelId: input.providerChannelId, transportErrors: circuit.transportErrors, correlationId: input.correlationId ?? null }));
        }
      } else {
        circuit.transportErrors = 0;
      }
      throw new Error(errorCode);
    }
    circuit.transportErrors = 0;
    const encoded = parsedMedia.base64.replace(/^data:[^;,]+;base64,/i, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const content = Buffer.from(encoded, 'base64');
    if (!content.length || content.length > MAX_EVOLUTION_INBOUND_MEDIA_BYTES) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
    return { content, mimeType: parsedMedia.mimetype ?? null, fileName: parsedMedia.fileName ?? null, sha256: createHash('sha256').update(content).digest('hex') };
  }

  private logResponse(input: InboundMediaAdapterInput, requestVariant: EvolutionResponseVariant, outcome: EvolutionResponseOutcome,
    startedAt: number, details: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event: 'evolution_media_response', outcome, stage: 'evolution_response', correlationId: input.correlationId ?? null,
      mediaType: input.mediaType, timeoutMs: input.mediaType === 'video' ? VIDEO_DOWNLOAD_TIMEOUT_MS : DEFAULT_DOWNLOAD_TIMEOUT_MS,
      durationMs: Math.max(0, Date.now() - startedAt), requestVariant, ...details }));
  }

  private safeContentType(value: string | null): string | null {
    if (!value) return null;
    return /^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:\s*;\s*charset=[a-z0-9-]+)?$/i.test(value) ? value.slice(0, 100) : 'other';
  }

  private responseShape(value: unknown): { topLevelKeys: string[]; base64Type: string; base64Length?: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { topLevelKeys: [], base64Type: 'missing' };
    const record = value as Record<string, unknown>;
    const topLevelKeys = Object.keys(record).filter((key) => /^[a-zA-Z0-9_-]{1,40}$/.test(key)).slice(0, 20);
    const base64 = record.base64;
    return { topLevelKeys, base64Type: typeof base64 === 'string' ? 'string' : base64 === undefined ? 'missing' : typeof base64,
      ...(typeof base64 === 'string' ? { base64Length: base64.length } : {}) };
  }

  private credentials(credentials: ChannelCredentialsDto): Extract<ChannelCredentialsDto, { provider: 'evolution' }> {
    if (credentials.provider !== 'evolution') throw new Error('MEDIA_SOURCE_INVALID');
    return credentials;
  }

  private async readBytes(response: Response, maximumBytes: number): Promise<Buffer> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
    if (!response.body) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) { await reader.cancel(); throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED'); }
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks, total);
  }
}
