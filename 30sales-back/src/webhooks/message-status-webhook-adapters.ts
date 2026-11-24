import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { WhatsappMessageStatusDto, type MessageDeliveryState, type WebhookProvider } from './webhooks.dto';

export interface MessageStatusWebhookAdapter {
  readonly provider: WebhookProvider;
  normalize(channelId: string, organizationId: string, value: unknown, payloadHash: string): WhatsappMessageStatusDto | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): Date {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed < 10_000_000_000 ? parsed * 1000 : parsed) : new Date();
}

function eventId(channelId: string, messageId: string, state: MessageDeliveryState, providerTimestamp: unknown, payloadHash: string): string {
  const version = typeof providerTimestamp === 'string' || typeof providerTimestamp === 'number' ? String(providerTimestamp) : payloadHash;
  return createHash('sha256').update(`${channelId}:${messageId}:${state}:${version}`).digest('hex');
}

@Injectable()
export class EvolutionMessageStatusWebhookAdapter implements MessageStatusWebhookAdapter {
  readonly provider = 'evolution' as const;

  normalize(channelId: string, organizationId: string, value: unknown, payloadHash: string): WhatsappMessageStatusDto | null {
    const data = record(value);
    const key = record(data.key);
    const update = record(data.update);
    const externalMessageId = string(data.keyId) ?? string(key.id);
    const providerStatus = update.status ?? data.status;
    const deliveryState = this.mapStatus(providerStatus);
    if (!externalMessageId || externalMessageId.length > 250 || !deliveryState) return null;
    const providerTimestamp = update.timestamp ?? data.messageTimestamp ?? data.timestamp;
    return new WhatsappMessageStatusDto(organizationId, channelId, this.provider, externalMessageId,
      eventId(channelId, externalMessageId, deliveryState, providerTimestamp, payloadHash), deliveryState, timestamp(providerTimestamp), payloadHash);
  }

  private mapStatus(status: unknown): MessageDeliveryState | null {
    if (typeof status === 'number') {
      if (status === 0) return 'failed';
      if (status === 1 || status === 2) return 'accepted';
      if (status === 3) return 'delivered';
      if (status === 4 || status === 5) return 'read';
      return null;
    }
    if (typeof status !== 'string') return null;
    const normalized = status.toUpperCase();
    if (normalized === 'ERROR' || normalized === 'FAILED') return 'failed';
    if (normalized === 'PENDING' || normalized === 'SERVER_ACK' || normalized === 'SENT') return 'accepted';
    if (normalized === 'DELIVERY_ACK' || normalized === 'DELIVERED') return 'delivered';
    if (normalized === 'READ' || normalized === 'PLAYED') return 'read';
    return null;
  }
}

@Injectable()
export class MetaCloudMessageStatusWebhookAdapter implements MessageStatusWebhookAdapter {
  readonly provider = 'whatsapp_cloud_api' as const;

  normalize(channelId: string, organizationId: string, value: unknown, payloadHash: string): WhatsappMessageStatusDto | null {
    const status = record(value);
    const externalMessageId = string(status.id);
    const providerStatus = string(status.status);
    const deliveryState = providerStatus === 'sent' ? 'accepted'
      : providerStatus === 'delivered' ? 'delivered'
      : providerStatus === 'read' ? 'read'
      : providerStatus === 'failed' ? 'failed' : null;
    if (!externalMessageId || externalMessageId.length > 250 || !deliveryState) return null;
    const providerTimestamp = status.timestamp;
    return new WhatsappMessageStatusDto(organizationId, channelId, this.provider, externalMessageId,
      eventId(channelId, externalMessageId, deliveryState, providerTimestamp, payloadHash), deliveryState, timestamp(providerTimestamp), payloadHash);
  }
}
