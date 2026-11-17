import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { assertPublicEvolutionTarget, UnsafeExternalTargetError } from '../common/assert-public-evolution-target';
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
  async list(credentials: Extract<ChannelCredentialsDto, { provider: 'evolution' }>): Promise<EvolutionInstanceDiscoveryDto[]> {
    try { await assertPublicEvolutionTarget(credentials.baseUrl); }
    catch (error) {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: error instanceof UnsafeExternalTargetError ? 'The Evolution API host is not available for discovery.' : 'The Evolution API could not be reached.' });
    }

    let response: Response;
    try {
      response = await fetch(`${credentials.baseUrl.replace(/\/+$/, '')}/instance/fetchInstances`, { method: 'GET', headers: { accept: 'application/json', apikey: credentials.apiKey }, signal: AbortSignal.timeout(EVOLUTION_DISCOVERY_LIMITS.timeoutMs), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: 'The Evolution API could not be reached.' });
    }
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_UNAVAILABLE', message: 'The Evolution API rejected the discovery request.' });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > EVOLUTION_DISCOVERY_LIMITS.responseBytes) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_RESPONSE_TOO_LARGE', message: 'The Evolution API response exceeded the discovery limit.' });
    if (!response.body) throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE', message: 'The Evolution API returned an empty discovery response.' });
    let payload: unknown;
    try {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let byteLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > EVOLUTION_DISCOVERY_LIMITS.responseBytes) {
          await reader.cancel();
          throw new Error('response-too-large');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new ServiceUnavailableException({ code: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE', message: 'The Evolution API returned an invalid discovery response.' });
    }
    const parsed = evolutionInstancesSchema.safeParse(payload);
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
