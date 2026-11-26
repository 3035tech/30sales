import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { WebhookProvider } from '../webhooks/webhooks.dto';

export type MediaDownloadResult = { readonly content: Buffer; readonly mimeType: string | null; readonly fileName: string | null; readonly sha256: string };
export type InboundMediaAdapterInput = { providerChannelId: string; mediaId: string | null; sourcePayload: string; credentials: ChannelCredentialsDto; correlationId?: string; mediaType?: string };

export interface InboundMediaAdapter {
  readonly provider: WebhookProvider;
  download(input: InboundMediaAdapterInput): Promise<MediaDownloadResult>;
}
