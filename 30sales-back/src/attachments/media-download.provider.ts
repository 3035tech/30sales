import { Injectable } from '@nestjs/common';
import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { WebhookProvider } from '../webhooks/webhooks.dto';
import { EvolutionInboundMediaAdapter } from './evolution-inbound-media.adapter';
import { MetaCloudInboundMediaAdapter } from './meta-cloud-inbound-media.adapter';
import type { InboundMediaAdapter, MediaDownloadResult } from './inbound-media-adapter';

@Injectable()
export class MediaDownloadProvider {
  private readonly adapters: ReadonlyMap<WebhookProvider, InboundMediaAdapter>;

  constructor(evolution: EvolutionInboundMediaAdapter, metaCloud: MetaCloudInboundMediaAdapter) {
    this.adapters = new Map<WebhookProvider, InboundMediaAdapter>([[evolution.provider, evolution], [metaCloud.provider, metaCloud]]);
  }

  async download(input: { provider: WebhookProvider; providerChannelId: string; mediaId: string | null; sourcePayload: string; credentials: ChannelCredentialsDto; correlationId?: string }): Promise<MediaDownloadResult> {
    const adapter = this.adapters.get(input.provider);
    if (!adapter || adapter.provider !== input.credentials.provider) throw new Error('MEDIA_SOURCE_INVALID');
    return adapter.download(input);
  }
}
