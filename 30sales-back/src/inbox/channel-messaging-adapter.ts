import type { ChannelCredentialsDto } from '../channels/channels.dto';
import type { SendConversationContactDto } from './inbox.dto';
import type { PreparedOutboundMedia } from './outbound-media';

export type ChannelMessagingProvider = 'evolution' | 'whatsapp_cloud_api';
export type ProviderSendResult = { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };
export type QuotedMessage = { externalMessageId: string; remoteJid: string | null; fromMe: boolean; participant: string | null; bodyText: string | null };
export type ContactMessageFields = Omit<SendConversationContactDto, 'idempotencyKey'>;
export type MessagingAdapterContext = { providerChannelId: string; recipientPhone: string; credentials: ChannelCredentialsDto; organizationId?: string; channelId?: string; messageId?: string; correlationId?: string | null };
export type GroupParticipant = { readonly id: string; readonly phone: string | null; readonly name: string | null; readonly isAdmin: boolean };
export type GroupParticipantsResult = { readonly supported: boolean; readonly participants: GroupParticipant[] };
export type ChannelMessagingCapabilities = {
  readonly directMessages: boolean;
  readonly groupReplies: boolean;
  readonly groupParticipants: boolean;
  readonly reactions: boolean;
  readonly quotedReplies: boolean;
  readonly media: boolean;
  readonly contactCards: boolean;
};

export interface ChannelMessagingAdapter {
  readonly provider: ChannelMessagingProvider;
  readonly capabilities: ChannelMessagingCapabilities;
  sendText(input: MessagingAdapterContext & { bodyText: string; targetMessage: QuotedMessage | null; mode: 'reply' | 'reaction' }): Promise<ProviderSendResult>;
  sendMedia(input: MessagingAdapterContext & { bodyText: string; media: PreparedOutboundMedia }): Promise<ProviderSendResult>;
  sendContact(input: MessagingAdapterContext & { contact: ContactMessageFields }): Promise<ProviderSendResult>;
  sendPresence?(input: MessagingAdapterContext & { state: 'composing' | 'paused' }): Promise<void>;
  listGroupParticipants(input: { providerChannelId: string; groupJid: string; credentials: ChannelCredentialsDto }): Promise<GroupParticipantsResult>;
}
