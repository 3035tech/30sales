import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CHANNEL_HEALTH_STATUS, ChannelBusinessLineTransferDto, ChannelConnectionStatusUpdateDto, ChannelCredentialsDto, ChannelHealthCheckAuditDto, ChannelHealthCheckDto, ChannelMonitoringCheckDto, ChannelMonitoringStatusDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryDeleteScheduleExceptionDto, ChannelRepositoryScheduleExceptionDto, ChannelRepositoryUpdateDto, channelCredentialsSchema, CreateChannelDto, platformEvolutionSecretsSchema, TransferChannelBusinessLineDto, UpdateChannelDto } from './channels.dto';
import type { ChannelConnectionStatus, ChannelHealthStatus, ChannelMonitoringCheckInputDto, ChannelScheduleExceptionDto, ChannelScheduleExceptionInputDto, ConfigureChannelCredentialsDto, EvolutionWebhookConfigurationStatus } from './channels.dto';
import { ChannelCredentialCryptoService } from './channel-credential-crypto.service';
import { ChannelConnectionHealthProvider } from './channel-connection-health.provider';
import { ChannelsRepository } from './channels.repository';
import { EvolutionInstanceDiscoveryProvider } from './evolution-instance-discovery.provider';
import { ChannelWebhookEventsPageDto, ChannelWebhookEventsQueryDto, ChannelWebhookEventRetryDto, ChannelWebhookEventRetryResultDto, EvolutionInstanceListDto, EvolutionWebhookConfigurationDto, ChannelRepositoryDeleteDto } from './channels.dto';
import { CHANNEL_CONNECTION_STATUS, CHANNEL_MONITORING_CHECK_CONCURRENCY, CHANNEL_PROVIDER, CHANNEL_WEBHOOK_EVENT_RETRY, EVOLUTION_WEBHOOK_CONFIGURATION_STATUS } from './channels.constants';
import { EvolutionWebhookConfigurationProvider } from './evolution-webhook-configuration.provider';
import { EvolutionConnectionProvider, EvolutionConnectionResultDto } from './evolution-connection.provider';
import { ChannelCredentialResolverService } from './channel-credential-resolver.service';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES, ORGANIZATION_ROLE } from '../auth/authorization.constants';
import { MEDIA_ATTACHMENT_STALE_AFTER_MINUTES } from '../attachments/media-attachment.constants';

@Injectable()
export class ChannelsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ChannelsRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly credentialResolver: ChannelCredentialResolverService, private readonly healthProvider: ChannelConnectionHealthProvider, private readonly evolutionDiscovery: EvolutionInstanceDiscoveryProvider, private readonly evolutionWebhookConfiguration: EvolutionWebhookConfigurationProvider, private readonly evolutionConnection: EvolutionConnectionProvider) {}
  async list(request: ApiRequestDto, businessLineId?: string): Promise<ChannelRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    return this.repository.list(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), businessLineId);
  }
  private async requireChannelAccess(organizationId: string, channelId: string, userId: string, role: string): Promise<void> {
    const canManageAllLines = hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES);
    if (!await this.repository.canAccessChannel(organizationId, channelId, userId, canManageAllLines)) {
      throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in an active business line available to you.' });
    }
  }
  async create(request: ApiRequestDto, input: CreateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.create(new ChannelRepositoryCreateDto(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), input, request.correlationId));
    if (result === 'duplicate') throw new ConflictException({ code: 'CHANNEL_ALREADY_CONFIGURED', message: 'The phone number or provider channel is already configured in this organization.' });
    if (result === 'business_line_not_found') throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The selected business line was not found in the active organization.' });
    if (result === 'business_line_forbidden') throw new ForbiddenException({ code: 'BUSINESS_LINE_ACCESS_FORBIDDEN', message: 'You are not assigned to the selected business line.' });
    return result;
  }
  async update(request: ApiRequestDto, channelId: string, input: UpdateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const result = await this.repository.update(new ChannelRepositoryUpdateDto(context.organizationId, channelId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), input, request.correlationId));
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (result === 'schedule_required') throw new BadRequestException({ code: 'CHANNEL_SCHEDULE_REQUIRED', message: 'Configure at least one business-hours window before enabling scheduled assistant replies.' });
    if (result === 'profile_mismatch') throw new BadRequestException({ code: 'ASSISTANT_PROFILE_CHANNEL_MISMATCH', message: 'Assistant profiles must match the channel business line and direction.' });
    return result;
  }
  async transferBusinessLine(request: ApiRequestDto, channelId: string, input: TransferChannelBusinessLineDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    if (!context.isPlatformOrganizationContext && !hasOrganizationRole(context.role, [ORGANIZATION_ROLE.owner, ORGANIZATION_ROLE.admin])) {
      throw new ForbiddenException({ code: 'CHANNEL_BUSINESS_LINE_TRANSFER_FORBIDDEN', message: 'Only company owners, company admins, and super admins can move a channel to another business line.' });
    }
    const result = await this.repository.transferBusinessLine(new ChannelBusinessLineTransferDto(context.organizationId, channelId, input.businessLineId, context.userId, request.correlationId));
    if (result === 'channel_not_found') throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (result === 'business_line_not_found') throw new NotFoundException({ code: 'BUSINESS_LINE_NOT_FOUND', message: 'The selected active business line was not found in this organization.' });
    if (result === 'active_campaign') throw new ConflictException({ code: 'CHANNEL_HAS_ACTIVE_CAMPAIGN', message: 'Pause campaigns using this number before moving it to another business line.' });
    return result;
  }
  async delete(request: ApiRequestDto, channelId: string): Promise<{ deleted: true; historyPreserved: true; remoteInstanceDeleted: boolean }> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const canManageAllLines = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId, context.userId, canManageAllLines);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_DELETE_PROVIDER_UNSUPPORTED', message: 'Only Evolution channels can currently be removed through this action.' });
    const deleted = await this.repository.softDelete(new ChannelRepositoryDeleteDto(context.organizationId, channelId, context.userId, canManageAllLines, false, request.correlationId));
    if (deleted === 'paired') throw new ConflictException({ code: 'CHANNEL_ALREADY_PAIRED', message: 'A WhatsApp number that has connected to Evolution cannot be deleted.' });
    if (deleted === false) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel could not be archived.' });
    if (deleted === 'provider_mismatch') throw new BadRequestException({ code: 'CHANNEL_DELETE_PROVIDER_UNSUPPORTED', message: 'Only Evolution channels can be removed through this action.' });
    return { deleted: true, historyPreserved: true, remoteInstanceDeleted: false };
  }
  async saveScheduleException(request: ApiRequestDto, channelId: string, input: ChannelScheduleExceptionInputDto): Promise<ChannelScheduleExceptionDto[]> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.saveScheduleException(new ChannelRepositoryScheduleExceptionDto(context.organizationId, channelId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), input, request.correlationId));
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }
  async deleteScheduleException(request: ApiRequestDto, channelId: string, exceptionId: string): Promise<{ deleted: true }> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const deleted = await this.repository.deleteScheduleException(new ChannelRepositoryDeleteScheduleExceptionDto(context.organizationId, channelId, exceptionId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), request.correlationId));
    if (deleted !== true) throw new NotFoundException({ code: 'CHANNEL_SCHEDULE_EXCEPTION_NOT_FOUND', message: 'The schedule exception was not found for this channel in the active organization.' });
    return { deleted: true };
  }
  async configureCredentials(request: ApiRequestDto, channelId: string, input: ConfigureChannelCredentialsDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const usesPlatformEvolutionConfiguration = input.provider === CHANNEL_PROVIDER.evolution && !('baseUrl' in input);
    if (usesPlatformEvolutionConfiguration) await this.assertPlatformEvolutionConfigured();
    const encrypted = usesPlatformEvolutionConfiguration
      ? this.credentialCrypto.encryptPayload(context.organizationId, channelId, JSON.stringify({ provider: CHANNEL_PROVIDER.evolution, webhookSecret: input.webhookSecret ?? randomBytes(32).toString('base64url') }))
      : this.credentialCrypto.encrypt(context.organizationId, channelId, channelCredentialsSchema.parse(input));
    const result = await this.repository.saveCredentials(new ChannelRepositoryCredentialsDto(context.organizationId, channelId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), input.provider, encrypted, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (result === 'provider_mismatch') throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The credentials do not match this channel provider.' });
    return result;
  }

  private async assertPlatformEvolutionConfigured(): Promise<void> {
    const configuration = await this.repository.platformEvolutionCredentials();
    if (!configuration) throw new ConflictException({ code: 'PLATFORM_EVOLUTION_NOT_CONFIGURED', message: 'The platform administrator must configure the Evolution API before connecting this channel.' });
    try {
      platformEvolutionSecretsSchema.parse(JSON.parse(this.credentialCrypto.decryptPayload('platform', 'evolution', configuration)) as unknown);
    } catch {
      throw new ConflictException({ code: 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID', message: 'The platform Evolution API configuration is invalid or could not be decrypted.' });
    }
  }

  async healthCheck(request: ApiRequestDto, channelId: string): Promise<ChannelHealthCheckDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const result = await this.checkHealthForOrganization(context.organizationId, channelId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), request.correlationId);
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }

  async checkMonitoring(request: ApiRequestDto, input: ChannelMonitoringCheckInputDto): Promise<ChannelMonitoringCheckDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    const canManageAllLines = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const inaccessibleChannels = await Promise.all(input.channelIds.map((channelId) => this.repository.canAccessChannel(context.organizationId, channelId, context.userId, canManageAllLines)));
    if (inaccessibleChannels.some((accessible) => !accessible)) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'One or more channels were not found in an active business line available to you.' });
    const targets = await this.repository.evolutionMonitoringTargets(context.organizationId, input.channelIds, context.userId, canManageAllLines);
    if (targets.length !== input.channelIds.length) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'One or more channels are unavailable or do not use Evolution API.' });
    const checkedAt = new Date();
    const failureCounts = await this.repository.recentFailedDeliveryCounts(context.organizationId, targets.map((target) => target.id), new Date(checkedAt.getTime() - 24 * 60 * 60 * 1000));
    const data: ChannelMonitoringStatusDto[] = [];
    for (let offset = 0; offset < targets.length; offset += CHANNEL_MONITORING_CHECK_CONCURRENCY) {
      const batch = targets.slice(offset, offset + CHANNEL_MONITORING_CHECK_CONCURRENCY);
      data.push(...await Promise.all(batch.map(async (target) => {
      let status: ChannelHealthStatus = CHANNEL_HEALTH_STATUS.unknown;
      let webhookConfigurationStatus: EvolutionWebhookConfigurationStatus = EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.notChecked;
      if (!target.isActive) status = CHANNEL_HEALTH_STATUS.unknown;
      else if (!target.credentials) {
        status = CHANNEL_HEALTH_STATUS.notConfigured;
        webhookConfigurationStatus = EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.notConfigured;
      }
      else {
        try {
          const credentials = await this.credentialResolver.resolve(context.organizationId, target.id, target.credentials);
          if (credentials.provider === CHANNEL_PROVIDER.evolution) {
            [status, webhookConfigurationStatus] = await Promise.all([
              this.healthProvider.check(target, credentials),
              this.evolutionWebhookConfiguration.checkConfiguration(credentials, target.providerChannelId, target.id),
            ]);
          } else {
            status = CHANNEL_HEALTH_STATUS.configurationError;
            webhookConfigurationStatus = EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.notChecked;
          }
        } catch {
          status = CHANNEL_HEALTH_STATUS.configurationError;
          webhookConfigurationStatus = EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.unavailable;
        }
      }
        return new ChannelMonitoringStatusDto(target.id, status, checkedAt.toISOString(), failureCounts.get(target.id) ?? 0, webhookConfigurationStatus);
      })));
    }
    return new ChannelMonitoringCheckDto(data, checkedAt.toISOString());
  }

  async discoverEvolutionInstances(request: ApiRequestDto, channelId: string): Promise<EvolutionInstanceListDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES));
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_DISCOVERY_PROVIDER_REQUIRED', message: 'Instance discovery requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before discovering instances.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = await this.credentialResolver.resolve(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    const instances = await this.evolutionDiscovery.list(credentials);
    return new EvolutionInstanceListDto(channelId, instances);
  }

  async configureEvolutionWebhook(request: ApiRequestDto, channelId: string): Promise<EvolutionWebhookConfigurationDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const canManageAllLines = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId, context.userId, canManageAllLines);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_WEBHOOK_PROVIDER_REQUIRED', message: 'Webhook configuration requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before configuring its webhook.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = await this.credentialResolver.resolve(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    await this.evolutionWebhookConfiguration.configure(credentials, target.providerChannelId, channelId);
    const configuredAt = new Date();
    const audited = await this.repository.auditEvolutionWebhookConfigured(context.organizationId, channelId, context.userId, canManageAllLines, configuredAt, request.correlationId);
    if (!audited) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return new EvolutionWebhookConfigurationDto(true, configuredAt.toISOString());
  }

  async connectEvolution(request: ApiRequestDto, channelId: string): Promise<EvolutionConnectionResultDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const canManageAllLines = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId, context.userId, canManageAllLines);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (!target.isActive) throw new ConflictException({ code: 'CHANNEL_DISABLED', message: 'Enable the channel before connecting its Evolution instance.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_CONNECT_PROVIDER_REQUIRED', message: 'WhatsApp pairing requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before connecting its instance.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = await this.credentialResolver.resolve(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    const instances = await this.evolutionDiscovery.list(credentials);
    const instanceExists = instances.some((instance) => instance.instanceName === target.providerChannelId);
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    let providerResult = instanceExists
      ? await this.evolutionConnection.connect(target.providerChannelId, credentials)
      : await this.evolutionConnection.create(target.providerChannelId, credentials);
    let webhookConfigured = false;
    try {
      await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
      await this.evolutionWebhookConfiguration.configure(credentials, target.providerChannelId, channelId);
      webhookConfigured = true;
      const configuredAt = new Date();
      await this.repository.auditEvolutionWebhookConfigured(context.organizationId, channelId, context.userId, canManageAllLines, configuredAt, request.correlationId);
    } catch {
      webhookConfigured = false;
    }
    if (!providerResult.qrDataUrl && providerResult.status !== CHANNEL_CONNECTION_STATUS.connected) {
      providerResult = await this.evolutionConnection.connect(target.providerChannelId, credentials);
    }
    const result = new EvolutionConnectionResultDto(providerResult.status, providerResult.qrDataUrl, webhookConfigured);
    const requestedAt = new Date();
    if (result.status !== CHANNEL_CONNECTION_STATUS.unknown) {
      await this.repository.setEvolutionConnectionStatus(new ChannelConnectionStatusUpdateDto(context.organizationId, channelId, result.status, requestedAt));
    }
    const audited = await this.repository.auditEvolutionConnectionRequested(context.organizationId, channelId, context.userId, canManageAllLines, result.status, requestedAt, request.correlationId);
    if (!audited) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }

  async listWebhookEvents(request: ApiRequestDto, channelId: string, query: ChannelWebhookEventsQueryDto): Promise<ChannelWebhookEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const canManageAllLines = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId, context.userId, canManageAllLines);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return this.repository.listWebhookEvents(context.organizationId, channelId, context.userId, canManageAllLines, query);
  }

  async mediaAttachmentHealth(request: ApiRequestDto, channelId: string) {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    await this.requireChannelAccess(context.organizationId, channelId, context.userId, context.role);
    const rows = await this.repository.mediaAttachmentHealth(context.organizationId, channelId);
    return { data: rows, staleAfterMinutes: MEDIA_ATTACHMENT_STALE_AFTER_MINUTES, generatedAt: new Date().toISOString() };
  }

  async retryWebhookEvent(request: ApiRequestDto, channelId: string, eventId: string): Promise<ChannelWebhookEventRetryResultDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const queued = await this.repository.retryEvolutionWebhookEvent(new ChannelWebhookEventRetryDto(context.organizationId, channelId, eventId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), request.correlationId));
    if (!queued) throw new NotFoundException({ code: 'CHANNEL_WEBHOOK_EVENT_NOT_RETRYABLE', message: 'The failed Evolution receipt event is unavailable for retry.' });
    return new ChannelWebhookEventRetryResultDto(CHANNEL_WEBHOOK_EVENT_RETRY.resultQueued);
  }

  async recordEvolutionConnectionStatus(organizationId: string, channelId: string, status: ChannelConnectionStatus, updatedAt = new Date()): Promise<void> {
    await this.repository.setEvolutionConnectionStatus(new ChannelConnectionStatusUpdateDto(organizationId, channelId, status, updatedAt));
  }

  async checkHealthForOrganization(organizationId: string, channelId: string, userId: string, canManageAllLines: boolean, correlationId: string | null): Promise<ChannelHealthCheckDto | null> {
    const target = await this.repository.healthCheckTarget(organizationId, channelId, userId, canManageAllLines);
    if (!target) return null;

    let status: ChannelHealthStatus = CHANNEL_HEALTH_STATUS.notConfigured;
    if (target.credentials) {
      let credentials: ChannelCredentialsDto | null = null;
      try {
        credentials = await this.credentialResolver.resolve(organizationId, channelId, target.credentials);
      } catch {
        status = CHANNEL_HEALTH_STATUS.configurationError;
      }
      if (credentials) {
        try { status = await this.healthProvider.check(target, credentials); }
        catch { status = CHANNEL_HEALTH_STATUS.unavailable; }
      }
    }

    if (target.provider === CHANNEL_PROVIDER.evolution) {
      const connectionStatus = this.toConnectionStatus(status);
      if (connectionStatus) await this.repository.setEvolutionConnectionStatus(new ChannelConnectionStatusUpdateDto(organizationId, channelId, connectionStatus, new Date()));
    }

    const checkedAt = new Date();
    const audited = await this.repository.auditHealthCheck(new ChannelHealthCheckAuditDto(organizationId, channelId, userId, canManageAllLines, status, checkedAt, correlationId));
    if (!audited) return null;
    return new ChannelHealthCheckDto(status, checkedAt.toISOString());
  }

  private toConnectionStatus(status: ChannelHealthStatus): ChannelConnectionStatus | null {
    if (status === CHANNEL_HEALTH_STATUS.connected) return CHANNEL_CONNECTION_STATUS.connected;
    if (status === CHANNEL_HEALTH_STATUS.connecting) return CHANNEL_CONNECTION_STATUS.connecting;
    if (status === CHANNEL_HEALTH_STATUS.disconnected) return CHANNEL_CONNECTION_STATUS.disconnected;
    if (status === CHANNEL_HEALTH_STATUS.unknown) return CHANNEL_CONNECTION_STATUS.unknown;
    return null;
  }
}
