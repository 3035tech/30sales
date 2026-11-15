import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { WebhookProvider } from '../webhooks/webhooks.dto';
import { env } from '../config/env';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 36 * 1024 * 1024;
const cloudMediaMetadataSchema = z.object({ url: z.string().url(), mime_type: z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).optional(), sha256: z.string().max(128).optional(), file_size: z.union([z.number(), z.string()]).optional() });
const evolutionMediaSourceSchema = z.object({ key: z.record(z.string(), z.unknown()), message: z.record(z.string(), z.unknown()) });
const evolutionMediaResponseSchema = z.object({ base64: z.string(), mimetype: z.string().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).optional(), fileName: z.string().max(255).optional() });

export type MediaDownloadResult = { readonly content: Buffer; readonly mimeType: string | null; readonly fileName: string | null; readonly sha256: string };

@Injectable()
export class MediaDownloadProvider {
  async download(input: { provider: WebhookProvider; providerChannelId: string; mediaId: string | null; sourcePayload: string; credentials: ChannelCredentialsDto }): Promise<MediaDownloadResult> {
    if (input.provider === 'whatsapp_cloud_api' && input.credentials.provider === 'whatsapp_cloud_api' && input.mediaId) return this.downloadCloudMedia(input.mediaId, input.credentials.accessToken);
    if (input.provider === 'evolution' && input.credentials.provider === 'evolution') return this.downloadEvolutionMedia(input.providerChannelId, input.sourcePayload, input.credentials);
    throw new Error('MEDIA_SOURCE_INVALID');
  }

  private async downloadCloudMedia(mediaId: string, accessToken: string): Promise<MediaDownloadResult> {
    const metadataResponse = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!metadataResponse.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const metadata = cloudMediaMetadataSchema.safeParse(JSON.parse(await this.readText(metadataResponse, 32_000)) as unknown);
    if (!metadata.success) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const parsedSize = typeof metadata.data.file_size === 'string' ? Number(metadata.data.file_size) : metadata.data.file_size;
    if (parsedSize !== undefined && (!Number.isSafeInteger(parsedSize) || parsedSize < 0 || parsedSize > MAX_MEDIA_BYTES)) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');

    let downloadUrl = this.validMetaMediaUrl(metadata.data.url);
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetch(downloadUrl, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000), redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const nextUrl = response.headers.get('location');
      if (!nextUrl || redirectCount === 3) throw new Error('MEDIA_PROVIDER_REDIRECT_INVALID');
      downloadUrl = this.validMetaMediaUrl(new URL(nextUrl, downloadUrl).toString());
    }
    if (!response?.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const content = await this.readBytes(response, MAX_MEDIA_BYTES);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (metadata.data.sha256 && /^[a-f0-9]{64}$/i.test(metadata.data.sha256) && sha256.toLowerCase() !== metadata.data.sha256.toLowerCase()) throw new Error('MEDIA_CHECKSUM_MISMATCH');
    const responseMimeType = response.headers.get('content-type')?.split(';')[0] ?? null;
    const mimeType = metadata.data.mime_type ?? (responseMimeType && responseMimeType.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(responseMimeType) ? responseMimeType : null);
    if (!content.length) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    return { content, mimeType, fileName: null, sha256 };
  }

  private async downloadEvolutionMedia(providerChannelId: string, sourcePayload: string, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<MediaDownloadResult> {
    const parsedSource = evolutionMediaSourceSchema.safeParse(JSON.parse(sourcePayload) as unknown);
    if (!parsedSource.success) throw new Error('MEDIA_SOURCE_INVALID');
    const baseUrl = new URL(credentials.baseUrl);
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(providerChannelId)}`;
    baseUrl.search = '';
    baseUrl.hash = '';
    const response = await fetch(baseUrl, {
      method: 'POST', headers: { apikey: credentials.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ message: parsedSource.data, convertToMp4: false }), signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
    if (!response.ok) throw new Error('MEDIA_PROVIDER_UNAVAILABLE');
    const parsedMedia = evolutionMediaResponseSchema.safeParse(JSON.parse(await this.readText(response, MAX_RESPONSE_BYTES)) as unknown);
    if (!parsedMedia.success) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const encoded = parsedMedia.data.base64.replace(/^data:[^;,]+;base64,/i, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('MEDIA_PROVIDER_RESPONSE_INVALID');
    const content = Buffer.from(encoded, 'base64');
    if (!content.length || content.length > MAX_MEDIA_BYTES) throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
    return { content, mimeType: parsedMedia.data.mimetype ?? null, fileName: parsedMedia.data.fileName ?? null, sha256: createHash('sha256').update(content).digest('hex') };
  }

  private validMetaMediaUrl(value: string): URL {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowed = ['fbcdn.net', 'fbsbx.com', 'whatsapp.net'].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (url.protocol !== 'https:' || !allowed || url.username || url.password) throw new Error('MEDIA_PROVIDER_URL_INVALID');
    return url;
  }

  private async readText(response: Response, maximumBytes: number): Promise<string> {
    const content = await this.readBytes(response, maximumBytes);
    return content.toString('utf8');
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
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error('MEDIA_SIZE_LIMIT_EXCEEDED');
      }
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks, total);
  }
}
