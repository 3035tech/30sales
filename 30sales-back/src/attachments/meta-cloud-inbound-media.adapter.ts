import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { InboundMediaAdapter, InboundMediaAdapterInput, MediaDownloadResult } from './inbound-media-adapter';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const metadataSchema = z.object({ url: z.string().url(), mime_type: z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).optional(), sha256: z.string().max(128).optional(), file_size: z.union([z.number(), z.string()]).optional() });

@Injectable()
export class MetaCloudInboundMediaAdapter implements InboundMediaAdapter {
  readonly provider = 'whatsapp_cloud_api' as const;

  async download(input: InboundMediaAdapterInput): Promise<MediaDownloadResult> {
    const credentials = this.credentials(input.credentials);
    if (!input.mediaId) throw new Error('MEDIA_SOURCE_INVALID');
    const metadataResponse = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(input.mediaId)}`, {
      headers: { authorization: `Bearer ${credentials.accessToken}` }, signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!metadataResponse.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const metadata = metadataSchema.safeParse(JSON.parse((await this.readBytes(metadataResponse, 32_000)).toString('utf8')) as unknown);
    if (!metadata.success) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const parsedSize = typeof metadata.data.file_size === 'string' ? Number(metadata.data.file_size) : metadata.data.file_size;
    if (parsedSize !== undefined && (!Number.isSafeInteger(parsedSize) || parsedSize < 0 || parsedSize > MAX_MEDIA_BYTES)) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');

    let downloadUrl = this.validMetaMediaUrl(metadata.data.url);
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetch(downloadUrl, { headers: { authorization: `Bearer ${credentials.accessToken}` }, signal: AbortSignal.timeout(15_000), redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('MEDIA_PROVIDER_REDIRECT_INVALID');
      downloadUrl = this.validMetaMediaUrl(new URL(location, downloadUrl).toString());
    }
    if (!response?.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const content = await this.readBytes(response, MAX_MEDIA_BYTES);
    if (!content.length) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (metadata.data.sha256 && /^[a-f0-9]{64}$/i.test(metadata.data.sha256) && sha256.toLowerCase() !== metadata.data.sha256.toLowerCase()) throw new Error('MEDIA_CHECKSUM_MISMATCH');
    const responseMimeType = response.headers.get('content-type')?.split(';')[0] ?? null;
    const mimeType = metadata.data.mime_type ?? (responseMimeType && responseMimeType.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(responseMimeType) ? responseMimeType : null);
    return { content, mimeType, fileName: null, sha256 };
  }

  private credentials(credentials: ChannelCredentialsDto): Extract<ChannelCredentialsDto, { provider: 'whatsapp_cloud_api' }> {
    if (credentials.provider !== 'whatsapp_cloud_api') throw new Error('MEDIA_SOURCE_INVALID');
    return credentials;
  }

  private validMetaMediaUrl(value: string): URL {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowed = ['fbcdn.net', 'fbsbx.com', 'whatsapp.net'].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (url.protocol !== 'https:' || !allowed || url.username || url.password) throw new Error('MEDIA_PROVIDER_URL_INVALID');
    return url;
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
