import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { PLATFORM_ERROR_CODE, PLATFORM_INVITATION_PATH } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { sendInvitationEmail } from '../email/templates';
import { env } from '../config/env';
import { PLATFORM_AI_USAGE } from './platform.constants';
import { PlatformAiUsageDto, PlatformAiUsagePointDto, PlatformAuditEventDto, PlatformContextDto, PlatformEvolutionConnectionCheckDto, PlatformOrganizationAccessResultDto, PlatformOrganizationCreateResultDto, PlatformOrganizationInvitationResultDto, PlatformOrganizationListDto, type CheckPlatformEvolutionConnectionDto, type CreatePlatformOrganizationDto, type CreatePlatformOrganizationInvitationDto, type ListPlatformOrganizationsQueryDto, type PlatformAiUsageQueryDto, type PlatformAuditQueryDto } from './platform.dto';
import { PlatformRepository } from './platform.repository';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { PlatformEvolutionConfigurationDto, type SavePlatformEvolutionConfigurationDto } from './platform.dto';
import { EvolutionInstanceDiscoveryProvider } from '../channels/evolution-instance-discovery.provider';
import { platformEvolutionSecretsSchema } from '../channels/channels.dto';

@Injectable()
export class PlatformService {
  constructor(private readonly repository: PlatformRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly evolutionDiscovery: EvolutionInstanceDiscoveryProvider) {}

  private async requireSuperAdmin(request: ApiRequestDto): Promise<PlatformContextDto> {
    const session = await auth.api.getSession({ headers: toWebHeaders(request.headers) });
    if (!session) throw new UnauthorizedException({ code: PLATFORM_ERROR_CODE.authRequired });
    if (!await this.repository.isSuperAdmin(session.user.id)) throw new ForbiddenException({ code: PLATFORM_ERROR_CODE.superAdminRequired });
    return new PlatformContextDto(session.user.id, session.user.name, session.user.email);
  }

  async listOrganizations(request: ApiRequestDto, query: ListPlatformOrganizationsQueryDto): Promise<PlatformOrganizationListDto> {
    await this.requireSuperAdmin(request);
    return this.repository.listOrganizations(query);
  }

  async aiUsage(request: ApiRequestDto, query: PlatformAiUsageQueryDto): Promise<PlatformAiUsageDto> {
    await this.requireSuperAdmin(request);
    const points = await this.repository.aiUsage(query);
    const aggregated = new Map<string, { point: PlatformAiUsagePointDto; costUnits: bigint | null }>();
    for (const point of points) {
      const key = JSON.stringify([point.organizationId, point.operation, point.model]);
      const existing = aggregated.get(key);
      const costUnits = decimalToUnits(point.estimatedCostUsd);
      if (existing) {
        existing.point = new PlatformAiUsagePointDto(point.organizationId, point.organizationName, point.organizationSlug, point.operation, point.model, existing.point.requestCount + point.requestCount, existing.point.inputTokens + point.inputTokens, existing.point.outputTokens + point.outputTokens, unitsToDecimal(sumCostUnits(existing.costUnits, costUnits)), existing.point.unpricedRequestCount + point.unpricedRequestCount);
        existing.costUnits = sumCostUnits(existing.costUnits, costUnits);
      } else {
        aggregated.set(key, { point, costUnits });
      }
    }
    const sorted = [...aggregated.values()].sort((left, right) => {
      if (left.costUnits !== null && right.costUnits !== null && left.costUnits !== right.costUnits) return left.costUnits > right.costUnits ? -1 : 1;
      if (left.costUnits !== null && right.costUnits === null) return -1;
      if (left.costUnits === null && right.costUnits !== null) return 1;
      return right.point.requestCount - left.point.requestCount || left.point.organizationName.localeCompare(right.point.organizationName);
    });
    const allPoints = sorted.map(({ point }) => point);
    const totalCost = sorted.reduce<bigint | null>((total, item) => sumCostUnits(total, item.costUnits), null);
    const pagedPoints = allPoints.slice(query.offset, query.offset + query.limit);
    return new PlatformAiUsageDto(query.from, query.to, allPoints.reduce((total, point) => total + point.requestCount, 0), allPoints.reduce((total, point) => total + point.inputTokens, 0), allPoints.reduce((total, point) => total + point.outputTokens, 0), unitsToDecimal(totalCost), allPoints.reduce((total, point) => total + point.unpricedRequestCount, 0), pagedPoints, { limit: query.limit, offset: query.offset, total: allPoints.length, hasNextPage: query.offset + pagedPoints.length < allPoints.length }, new Date().toISOString());
  }

  async getEvolutionConfiguration(request: ApiRequestDto): Promise<PlatformEvolutionConfigurationDto> {
    await this.requireSuperAdmin(request);
    return this.repository.getEvolutionConfiguration();
  }

  async listEvolutionAudit(request: ApiRequestDto, query: PlatformAuditQueryDto): Promise<PlatformAuditEventDto[]> {
    await this.requireSuperAdmin(request);
    return this.repository.listEvolutionAudit(query);
  }

  async saveEvolutionConfiguration(request: ApiRequestDto, input: SavePlatformEvolutionConfigurationDto): Promise<PlatformEvolutionConfigurationDto> {
    const actor = await this.requireSuperAdmin(request);
    const encrypted = this.credentialCrypto.encryptPayload('platform', 'evolution', JSON.stringify({ apiKey: input.apiKey }));
    return this.repository.saveEvolutionConfiguration(input, encrypted, actor.userId, request.correlationId);
  }

  async checkEvolutionConfiguration(request: ApiRequestDto, input: CheckPlatformEvolutionConnectionDto): Promise<PlatformEvolutionConnectionCheckDto> {
    await this.requireSuperAdmin(request);
    if (input.baseUrl && input.apiKey) {
      const instances = await this.evolutionDiscovery.list({ baseUrl: input.baseUrl, apiKey: input.apiKey });
      return new PlatformEvolutionConnectionCheckDto(true, instances.length, new Date().toISOString());
    }
    const configuration = await this.repository.getEvolutionCredentials();
    if (!configuration) throw new ConflictException({ code: 'PLATFORM_EVOLUTION_NOT_CONFIGURED', message: 'Configure the Evolution API before checking the connection.' });
    let plaintext: string;
    try { plaintext = this.credentialCrypto.decryptPayload('platform', 'evolution', configuration); }
    catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ConflictException({ code: 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID', message: 'The Evolution API configuration could not be decrypted.' });
    }
    let secrets: { apiKey: string };
    try { secrets = platformEvolutionSecretsSchema.parse(JSON.parse(plaintext) as unknown); }
    catch { throw new ConflictException({ code: 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID', message: 'The Evolution API configuration is invalid.' }); }
    const instances = await this.evolutionDiscovery.list({ baseUrl: configuration.baseUrl, apiKey: secrets.apiKey });
    return new PlatformEvolutionConnectionCheckDto(true, instances.length, new Date().toISOString());
  }

  async accessOrganization(request: ApiRequestDto, organizationId: string): Promise<PlatformOrganizationAccessResultDto> {
    const actor = await this.requireSuperAdmin(request);
    const recorded = await this.repository.recordOrganizationAccess(organizationId, actor, request.correlationId);
    if (!recorded) throw new NotFoundException({ code: PLATFORM_ERROR_CODE.organizationNotFound });
    return new PlatformOrganizationAccessResultDto(organizationId, true);
  }

  async listOrganizationMembers(request: ApiRequestDto, organizationId: string) {
    await this.requireSuperAdmin(request);
    const result = await this.repository.listOrganizationMembers(organizationId);
    if (!result) throw new NotFoundException({ code: PLATFORM_ERROR_CODE.organizationNotFound });
    return result;
  }

  async inviteOrganizationMember(request: ApiRequestDto, organizationId: string, input: CreatePlatformOrganizationInvitationDto): Promise<PlatformOrganizationInvitationResultDto> {
    const actor = await this.requireSuperAdmin(request);
    const result = await this.repository.createOrganizationInvitation(organizationId, input, actor.userId, request.correlationId);
    if (result === 'not_found') throw new NotFoundException({ code: PLATFORM_ERROR_CODE.organizationNotFound });
    if (result === 'already_invited') throw new ConflictException({ code: PLATFORM_ERROR_CODE.invitationAlreadyPending });
    let emailSent = false;
    try {
      await sendInvitationEmail({ id: result.invitationId, email: result.email, inviter: { user: { name: actor.name, email: actor.email } }, organization: { name: result.organizationName } });
      emailSent = true;
    } catch {
      emailSent = false;
    }
    return new PlatformOrganizationInvitationResultDto(result.email, emailSent);
  }

  async createOrganization(request: ApiRequestDto, input: CreatePlatformOrganizationDto): Promise<PlatformOrganizationCreateResultDto> {
    const actor = await this.requireSuperAdmin(request);
    const result = await this.repository.createOrganization(input, actor, request.correlationId);
    if (!result) throw new ConflictException({ code: PLATFORM_ERROR_CODE.organizationSlugAlreadyExists });
    const invitationUrl = new URL(PLATFORM_INVITATION_PATH, env.FRONTEND_URL);
    invitationUrl.searchParams.set('id', result.invitationId);
    let emailSent = false;
    try {
      await sendInvitationEmail({ id: result.invitationId, email: input.ownerEmail.toLowerCase(), inviter: { user: { name: actor.name, email: actor.email } }, organization: { name: result.organization.name } });
      emailSent = true;
    } catch {
      emailSent = false;
    }
    return new PlatformOrganizationCreateResultDto(result.organization, { email: input.ownerEmail.toLowerCase(), invitationUrl: invitationUrl.toString(), emailSent });
  }
}

function decimalToUnits(value: string | null): bigint | null {
  if (value === null) return null;
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = fraction.padEnd(PLATFORM_AI_USAGE.costDecimalPlaces, '0').slice(0, PLATFORM_AI_USAGE.costDecimalPlaces);
  return BigInt(whole) * 10n ** BigInt(PLATFORM_AI_USAGE.costDecimalPlaces) + BigInt(paddedFraction);
}

function sumCostUnits(left: bigint | null, right: bigint | null): bigint | null {
  if (left === null) return right;
  if (right === null) return left;
  return left + right;
}

function unitsToDecimal(value: bigint | null): string | null {
  if (value === null) return null;
  const scale = 10n ** BigInt(PLATFORM_AI_USAGE.costDecimalPlaces);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(PLATFORM_AI_USAGE.costDecimalPlaces, '0');
  return `${whole}.${fraction}`;
}
