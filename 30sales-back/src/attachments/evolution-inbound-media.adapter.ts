import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { InboundMediaAdapter, InboundMediaAdapterInput, MediaDownloadResult } from './inbound-media-adapter';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 36 * 1024 * 1024;
const sourceSchema = z.object({ key: z.record(z.string(), z.unknown()), message: z.record(z.string(), z.unknown()) });
const responseSchema = z.object({ base64: z.string(), mimetype: z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).optional(), fileName: z.string().max(255).optional() });

@Injectable()
export class EvolutionInboundMediaAdapter implements InboundMediaAdapter {
  readonly provider = 'evolution' as const;

  async download(input: InboundMediaAdapterInput): Promise<MediaDownloadResult> {
    const credentials = this.credentials(input.credentials);
    const source = sourceSchema.safeParse(JSON.parse(input.sourcePayload) as unknown);
    if (!source.success) throw new Error('MEDIA_SOURCE_INVALID');
    const url = new URL(credentials.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(input.providerChannelId)}`;
    url.search = '';
    url.hash = '';
    await assertPublicEvolutionTarget(url.toString());
    const response = await fetch(url, { method: 'POST', headers: { apikey: credentials.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ message: source.data, convertToMp4: false }), signal: AbortSignal.timeout(20_000), redirect: 'error' });
    if (!response.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const raw = await this.readBytes(response, MAX_RESPONSE_BYTES);
    const parsed = responseSchema.safeParse(JSON.parse(raw.toString('utf8')) as unknown);
    if (!parsed.success) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const encoded = parsed.data.base64.replace(/^data:[^;,]+;base64,/i, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const content = Buffer.from(encoded, 'base64');
    if (!content.length || content.length > MAX_MEDIA_BYTES) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
    return { content, mimeType: parsed.data.mimetype ?? null, fileName: parsed.data.fileName ?? null, sha256: createHash('sha256').update(content).digest('hex') };
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
