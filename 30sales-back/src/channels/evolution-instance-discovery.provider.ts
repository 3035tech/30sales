import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import { CHANNEL_HEALTH_STATUS } from './channels.dto';
import type { ChannelHealthStatus, ChannelCredentialsDto } from './channels.dto';

const EVOLUTION_DISCOVERY_LIMITS = { timeoutMs: 8_000, responseBytes: 256_000, instances: 500 } as const;
const evolutionInstanceSchema = z.object({ instance: z.object({ instanceName: z.string().trim().min(1).max(200), owner: z.string().max(200).optional(), profileName: z.string().max(200).optional(), status: z.string().max(40).optional() }).passthrough() }).passthrough();
const evolutionInstancesSchema = z.array(evolutionInstanceSchema).max(EVOLUTION_DISCOVERY_LIMITS.instances);

export class EvolutionInstanceDiscoveryDto {
  constructor(readonly instanceName: string, readonly displayName: string, readonly phoneNumber: string | null, readonly status: ChannelHealthStatus) {}
}

@Injectable()
export class EvolutionInstanceDiscoveryProvider {
  async list(credentials: Pick<Extract<ChannelCredentialsDto, { provider: 'evolution' }>, 'baseUrl' | 'apiKey'>): Promise<EvolutionInstanceDiscoveryDto[]> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      if (error instanceof UnsafeExternalTargetError) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_TARGET_BLOCKED', message: 'The Evolution API URL resolves to a private or reserved network address.' });
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: 'The Evolution API could not be reached.' });
    }

    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/fetchInstances`, { method: 'GET', headers: { accept: 'application/json', apikey: credentials.apiKey }, signal: AbortSignal.timeout(EVOLUTION_DISCOVERY_LIMITS.timeoutMs), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: 'The Evolution API could not be reached.' });
    }
    if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException({ code: 'EVOLUTION_API_KEY_REJECTED', message: 'The Evolution API rejected the API key or its instance-list permission.' });
    if (response.status === 404) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_ENDPOINT_NOT_FOUND', message: 'The Evolution instance discovery endpoint was not found at the configured URL.' });
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: 'The Evolution API rejected the discovery request.' });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > EVOLUTION_DISCOVERY_LIMITS.responseBytes) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_RESPONSE_TOO_LARGE', message: 'The Evolution API response exceeded the discovery limit.' });
    if (!response.body) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE', message: 'The Evolution API returned an empty discovery response.' });
    const result = await readLimitedJsonResponse(response, EVOLUTION_DISCOVERY_LIMITS.responseBytes);
    if (!result.ok) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE', message: 'The Evolution API returned an invalid discovery response.' });
    }
    const parsed = evolutionInstancesSchema.safeParse(result.payload);
    if (!parsed.success) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE', message: 'The Evolution API returned an unsupported discovery response.' });
    return parsed.data.map(({ instance }) => new EvolutionInstanceDiscoveryDto(instance.instanceName, instance.profileName?.trim() || instance.instanceName, this.toE164(instance.owner), this.toHealthStatus(instance.status)));
  }

  private toE164(owner: string | undefined): string | null {
    if (!owner || !owner.endsWith('@s.whatsapp.net')) return null;
    const ownerNumber = owner.slice(0, owner.indexOf('@')).split(':', 1)[0];
    const digits = ownerNumber.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? `+${digits}` : null;
  }

  private toHealthStatus(status: string | undefined): ChannelHealthStatus {
    const normalized = status?.trim().toLowerCase();
    if (normalized === 'open' || normalized === 'connected') return CHANNEL_HEALTH_STATUS.connected;
    if (normalized === 'connecting') return CHANNEL_HEALTH_STATUS.connecting;
    if (normalized === 'close' || normalized === 'closed' || normalized === 'disconnected') return CHANNEL_HEALTH_STATUS.disconnected;
    return CHANNEL_HEALTH_STATUS.unknown;
  }
}
