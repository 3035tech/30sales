import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { PLATFORM_ERROR_CODE, PLATFORM_INVITATION_PATH } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { sendInvitationEmail } from '../email/templates';
import { env } from '../config/env';
import { PlatformAuditEventDto, PlatformContextDto, PlatformEvolutionConnectionCheckDto, PlatformOrganizationAccessResultDto, PlatformOrganizationCreateResultDto, PlatformOrganizationListDto, type CreatePlatformOrganizationDto, type ListPlatformOrganizationsQueryDto, type PlatformAuditQueryDto } from './platform.dto';
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

  async checkEvolutionConfiguration(request: ApiRequestDto): Promise<PlatformEvolutionConnectionCheckDto> {
    await this.requireSuperAdmin(request);
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
