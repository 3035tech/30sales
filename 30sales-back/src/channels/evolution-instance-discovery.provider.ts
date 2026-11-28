import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { evolutionFetch } from '../common/evolution-http-client';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import { CHANNEL_HEALTH_STATUS } from './channels.dto';
import type { ChannelHealthStatus, ChannelCredentialsDto } from './channels.dto';

const EVOLUTION_DISCOVERY_LIMITS = { timeoutMs: 8_000, responseBytes: 256_000, instances: 500 } as const;
const EVOLUTION_DISCOVERY_HTTP_STATUS = { unauthorized: 401, forbidden: 403, notFound: 404 } as const;
export const EVOLUTION_DISCOVERY_ERROR = {
  targetBlocked: 'EVOLUTION_DISCOVERY_TARGET_BLOCKED',
  unavailable: 'EVOLUTION_DISCOVERY_UNAVAILABLE',
  timeout: 'EVOLUTION_DISCOVERY_TIMEOUT',
  keyRejected: 'EVOLUTION_API_KEY_REJECTED',
  endpointNotFound: 'EVOLUTION_DISCOVERY_ENDPOINT_NOT_FOUND',
  requestFailed: 'EVOLUTION_DISCOVERY_REQUEST_FAILED',
  responseTooLarge: 'EVOLUTION_DISCOVERY_RESPONSE_TOO_LARGE',
  invalidResponse: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE',
} as const;
const evolutionInstanceDetailsSchema = z.object({
  instanceName: z.string().trim().min(1).max(200),
  owner: z.string().max(200).nullable().optional(),
  profileName: z.string().max(200).nullable().optional(),
  status: z.string().max(40).nullable().optional(),
});
const wrappedEvolutionInstanceSchema = z.object({ instance: evolutionInstanceDetailsSchema }).transform(({ instance }) => instance);
const flatEvolutionInstanceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerJid: z.string().max(200).nullable().optional(),
  profileName: z.string().max(200).nullable().optional(),
  connectionStatus: z.string().max(40).nullable().optional(),
}).transform(({ name, ownerJid, profileName, connectionStatus }) => ({
  instanceName: name,
  owner: ownerJid,
  profileName,
  status: connectionStatus,
}));
const evolutionInstancesSchema = z.array(z.union([wrappedEvolutionInstanceSchema, flatEvolutionInstanceSchema])).max(EVOLUTION_DISCOVERY_LIMITS.instances);

export class EvolutionInstanceDiscoveryDto {
  constructor(readonly instanceName: string, readonly displayName: string, readonly phoneNumber: string | null, readonly status: ChannelHealthStatus) {}
}

@Injectable()
export class EvolutionInstanceDiscoveryProvider {
  async list(credentials: Pick<Extract<ChannelCredentialsDto, { provider: 'evolution' }>, 'baseUrl' | 'apiKey'>): Promise<EvolutionInstanceDiscoveryDto[]> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      if (error instanceof UnsafeExternalTargetError) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.targetBlocked, message: 'The Evolution API URL resolves to a private or reserved network address.' });
      throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.unavailable, message: 'The Evolution API hostname could not be resolved by the 30Sales backend.' });
    }

    let response: Response;
    try {
      response = await evolutionFetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/fetchInstances`, { method: 'GET', headers: { accept: 'application/json', apikey: credentials.apiKey }, signal: AbortSignal.timeout(EVOLUTION_DISCOVERY_LIMITS.timeoutMs), redirect: 'error' });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ServiceUnavailableException({
        code: timedOut ? EVOLUTION_DISCOVERY_ERROR.timeout : EVOLUTION_DISCOVERY_ERROR.unavailable,
        message: timedOut ? 'The Evolution API did not respond within the connection-check timeout.' : 'The 30Sales backend could not establish a connection to the Evolution API.',
      });
    }
    if (response.status === EVOLUTION_DISCOVERY_HTTP_STATUS.unauthorized || response.status === EVOLUTION_DISCOVERY_HTTP_STATUS.forbidden) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.keyRejected, message: 'The Evolution API rejected the API key or its instance-list permission.' });
    if (response.status === EVOLUTION_DISCOVERY_HTTP_STATUS.notFound) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.endpointNotFound, message: 'The Evolution instance discovery endpoint was not found at the configured URL.' });
    if (!response.ok) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.requestFailed, message: `The Evolution API returned HTTP ${response.status} while listing instances.` });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > EVOLUTION_DISCOVERY_LIMITS.responseBytes) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.responseTooLarge, message: 'The Evolution API response exceeded the discovery limit.' });
    if (!response.body) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.invalidResponse, message: 'The Evolution API returned an empty discovery response.' });
    const result = await readLimitedJsonResponse(response, EVOLUTION_DISCOVERY_LIMITS.responseBytes);
    if (!result.ok) {
      throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.invalidResponse, message: 'The Evolution API returned an invalid discovery response.' });
    }
    const parsed = evolutionInstancesSchema.safeParse(result.payload);
    if (!parsed.success) throw new ServiceUnavailableException({ code: EVOLUTION_DISCOVERY_ERROR.invalidResponse, message: 'The Evolution API returned an unsupported discovery response.' });
    return parsed.data.map((instance) => new EvolutionInstanceDiscoveryDto(instance.instanceName, instance.profileName?.trim() || instance.instanceName, this.toE164(instance.owner ?? undefined), this.toHealthStatus(instance.status ?? undefined)));
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
