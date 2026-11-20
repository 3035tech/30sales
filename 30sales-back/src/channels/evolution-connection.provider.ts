import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import type { ChannelCredentialsDto, ChannelConnectionStatus } from './channels.dto';
import { CHANNEL_CONNECTION_STATUS } from './channels.constants';

const CONNECTION_LIMITS = { timeoutMs: 8_000, responseBytes: 512_000, qrDataUrlLength: 450_000 } as const;
type JsonRecord = Record<string, unknown>;

export class EvolutionConnectionResultDto {
  constructor(readonly status: ChannelConnectionStatus, readonly qrDataUrl: string | null, readonly webhookConfigured = false) {}
}

@Injectable()
export class EvolutionConnectionProvider {
  async create(instanceName: string, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<EvolutionConnectionResultDto> {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/.test(instanceName)) {
      throw new BadRequestException({ code: 'EVOLUTION_INSTANCE_NAME_INVALID', message: 'The instance name must use letters, numbers, or hyphens and start with a letter or number.' });
    }
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for instance creation.' : 'The Evolution API could not be reached.' });
    }
    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/create`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', apikey: credentials.apiKey },
        body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        signal: AbortSignal.timeout(CONNECTION_LIMITS.timeoutMs), redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_CREATE_UNAVAILABLE', message: 'The Evolution API could not be reached to create the instance.' });
    }
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_CREATE_REJECTED', message: 'The Evolution API rejected instance creation. Check whether the instance name is available and the API key can manage instances.' });
    const result = await readLimitedJsonResponse(response, CONNECTION_LIMITS.responseBytes);
    if (!result.ok || !result.payload) throw new ServiceUnavailableException({ code: 'EVOLUTION_CREATE_INVALID_RESPONSE', message: 'The Evolution API returned an invalid instance creation response.' });
    return this.toResult(result.payload);
  }

  async connect(instanceName: string, credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<EvolutionConnectionResultDto> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for connection.' : 'The Evolution API could not be reached.' });
    }

    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/connect/${encodeURIComponent(instanceName)}`, {
        method: 'GET', headers: { accept: 'application/json', apikey: credentials.apiKey },
        signal: AbortSignal.timeout(CONNECTION_LIMITS.timeoutMs), redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_UNAVAILABLE', message: 'The Evolution API could not be reached to start WhatsApp pairing.' });
    }
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_REJECTED', message: 'The Evolution API rejected the connection request.' });
    const result = await readLimitedJsonResponse(response, CONNECTION_LIMITS.responseBytes);
    if (!result.ok || !result.payload) throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_INVALID_RESPONSE', message: 'The Evolution API returned an invalid connection response.' });
    return this.toResult(result.payload);
  }

  async delete(instanceName: string, credentials: Pick<Extract<ChannelCredentialsDto, { provider: 'evolution' }>, 'baseUrl' | 'apiKey'>): Promise<void> {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/.test(instanceName)) {
      throw new BadRequestException({ code: 'EVOLUTION_INSTANCE_NAME_INVALID', message: 'The instance name is invalid.' });
    }
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DELETE_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for instance removal.' : 'The Evolution API could not be reached.' });
    }
    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE', headers: { accept: 'application/json', apikey: credentials.apiKey },
        signal: AbortSignal.timeout(CONNECTION_LIMITS.timeoutMs), redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DELETE_UNAVAILABLE', message: 'The Evolution API could not confirm removal of the instance.' });
    }
    if (response.status === 404) return;
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_DELETE_REJECTED', message: 'The Evolution API rejected instance removal. The channel remains registered in 30Sales.' });
  }

  private toResult(payload: unknown): EvolutionConnectionResultDto {
    const root = this.asRecord(payload);
    if (root.error === true || this.string(root.status)?.toLowerCase() === 'error') {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_CONNECT_REJECTED', message: 'The Evolution API could not prepare WhatsApp pairing for this instance.' });
    }
    const instance = this.asRecord(root.instance);
    const qr = this.asRecord(root.qrcode);
    const qrDataUrl = this.parseQrDataUrl(qr.base64) ?? this.parseQrDataUrl(root.base64);
    const rawState = this.string(instance.state) ?? this.string(instance.status) ?? this.string(root.state) ?? this.string(root.status);
    const status = this.connectionStatus(rawState, qrDataUrl);
    return new EvolutionConnectionResultDto(status, qrDataUrl);
  }

  private parseQrDataUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > CONNECTION_LIMITS.qrDataUrlLength) return null;
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
  }

  private connectionStatus(state: string | null, qrDataUrl: string | null): ChannelConnectionStatus {
    const normalized = state?.trim().toLowerCase();
    if (normalized === 'open' || normalized === 'connected') return CHANNEL_CONNECTION_STATUS.connected;
    if (normalized === 'connecting' || qrDataUrl) return CHANNEL_CONNECTION_STATUS.connecting;
    if (normalized === 'close' || normalized === 'closed' || normalized === 'disconnected') return CHANNEL_CONNECTION_STATUS.disconnected;
    return CHANNEL_CONNECTION_STATUS.unknown;
  }

  private asRecord(value: unknown): JsonRecord { return this.isRecord(value) ? value : {}; }
  private isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private string(value: unknown): string | null { return typeof value === 'string' && value.length <= 100 ? value : null; }
}
