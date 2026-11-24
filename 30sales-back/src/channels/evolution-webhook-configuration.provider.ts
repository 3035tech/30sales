import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { env } from '../config/env';
import type { ChannelCredentialsDto } from './channels.dto';

const EVOLUTION_WEBHOOK_CONFIG_TIMEOUT_MS = 8_000;
const EVOLUTION_WEBHOOK_PATH = '/webhook/set';
// Keep this allowlist aligned with the events exposed by the Evolution v2.3.7 manager.
const EVOLUTION_WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP', 'CALL', 'CHATS_DELETE', 'CHATS_SET', 'CHATS_UPDATE', 'CHATS_UPSERT',
  'CONNECTION_UPDATE', 'CONTACTS_SET', 'CONTACTS_UPDATE', 'CONTACTS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE', 'GROUP_UPDATE', 'GROUPS_UPSERT', 'LABELS_ASSOCIATION', 'LABELS_EDIT',
  'LOGOUT_INSTANCE', 'MESSAGES_DELETE', 'MESSAGES_EDITED', 'MESSAGES_SET', 'MESSAGES_UPDATE', 'MESSAGES_UPSERT',
  'PRESENCE_UPDATE', 'QRCODE_UPDATED', 'REMOVE_INSTANCE', 'SEND_MESSAGE', 'SEND_MESSAGE_UPDATE', 'TYPEBOT_CHANGE_STATUS', 'TYPEBOT_START',
] as const;

const WEBHOOK_SECRET_HEADER = 'X-30Sales-Webhook-Key';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class EvolutionWebhookConfigurationProvider {
  async configure(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>, instanceName: string, channelId: string): Promise<void> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for webhook configuration.' : 'The Evolution API could not be reached.' });
    }

    const callbackUrl = new URL(`/api/v1/webhooks/evolution/${encodeURIComponent(channelId)}`, env.FRONTEND_URL).toString();
    const path = `${EVOLUTION_WEBHOOK_PATH}/${encodeURIComponent(instanceName)}`;
    const response = await this.request(credentials, path, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', apikey: credentials.apiKey },
      body: JSON.stringify({ webhook: {
        enabled: true,
        url: callbackUrl,
        headers: { [WEBHOOK_SECRET_HEADER]: credentials.webhookSecret },
        events: EVOLUTION_WEBHOOK_EVENTS,
        byEvents: false,
        base64: false,
      } }),
    });
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_REJECTED', message: 'The Evolution API rejected the webhook configuration.' });

    const verification = await this.request(credentials, `/webhook/find/${encodeURIComponent(instanceName)}`, {
      method: 'GET',
      headers: { accept: 'application/json', apikey: credentials.apiKey },
    });
    if (!verification.ok || !await this.matchesConfiguration(verification, callbackUrl, credentials.webhookSecret)) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_NOT_CONFIRMED', message: 'The Evolution API did not confirm the webhook URL, secret header, or subscribed events.' });
    }
  }

  private async matchesConfiguration(response: Response, callbackUrl: string, webhookSecret: string): Promise<boolean> {
    try {
      const body: unknown = await response.json();
      const envelope = isRecord(body) && isRecord(body.webhook) ? body.webhook : body;
      const root = isRecord(envelope) && isRecord(envelope.webhook) ? envelope.webhook : envelope;
      if (!isRecord(root)) return false;
      const configuredEvents = root.events;
      if (!Array.isArray(configuredEvents) || !configuredEvents.every((event): event is string => typeof event === 'string')) return false;
      if (root.enabled !== true || root.url !== callbackUrl || root.webhookByEvents !== false || root.webhookBase64 !== false) return false;
      if (configuredEvents.length !== EVOLUTION_WEBHOOK_EVENTS.length || EVOLUTION_WEBHOOK_EVENTS.some((event) => !configuredEvents.includes(event))) return false;
      if (!isRecord(root.headers)) return false;
      const secretHeader = Object.entries(root.headers).find(([name]) => name.toLowerCase() === WEBHOOK_SECRET_HEADER.toLowerCase());
      if (secretHeader?.[1] !== webhookSecret) return false;
      return true;
    } catch {
      return false;
    }
  }

  private async request(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>, path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}${path}`, { ...init, signal: AbortSignal.timeout(EVOLUTION_WEBHOOK_CONFIG_TIMEOUT_MS), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_UNAVAILABLE', message: 'The Evolution API could not be reached to configure its webhook.' });
    }
  }
}
