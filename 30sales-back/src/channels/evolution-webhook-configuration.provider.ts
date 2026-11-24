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
  'LOGOUT_INSTANCE', 'MESSAGES_DELETE', 'MESSAGES_SET', 'MESSAGES_UPDATE', 'MESSAGES_UPSERT',
  'PRESENCE_UPDATE', 'QRCODE_UPDATED', 'REMOVE_INSTANCE', 'SEND_MESSAGE', 'TYPEBOT_CHANGE_STATUS', 'TYPEBOT_START',
] as const;

@Injectable()
export class EvolutionWebhookConfigurationProvider {
  async configure(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>, instanceName: string, channelId: string): Promise<void> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for webhook configuration.' : 'The Evolution API could not be reached.' });
    }

    const callbackUrl = new URL(`/api/v1/webhooks/evolution/${encodeURIComponent(channelId)}`, env.FRONTEND_URL).toString();
    const response = await this.request(credentials, `${EVOLUTION_WEBHOOK_PATH}/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', apikey: credentials.apiKey },
      body: JSON.stringify({ webhook: {
        enabled: true,
        url: callbackUrl,
        headers: { 'X-30Sales-Webhook-Key': credentials.webhookSecret },
        events: EVOLUTION_WEBHOOK_EVENTS,
        byEvents: false,
        base64: false,
      } }),
    });
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_REJECTED', message: 'The Evolution API rejected the webhook configuration.' });
  }

  private async request(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>, path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}${path}`, { ...init, signal: AbortSignal.timeout(EVOLUTION_WEBHOOK_CONFIG_TIMEOUT_MS), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_WEBHOOK_UNAVAILABLE', message: 'The Evolution API could not be reached to configure its webhook.' });
    }
  }
}
