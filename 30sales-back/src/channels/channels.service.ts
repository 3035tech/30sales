import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { CHANNEL_HEALTH_STATUS, ChannelConnectionStatusUpdateDto, ChannelCredentialsDto, ChannelHealthCheckAuditDto, ChannelHealthCheckDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryUpdateDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import type { ChannelConnectionStatus, ChannelHealthStatus } from './channels.dto';
import { ChannelCredentialCryptoService } from './channel-credential-crypto.service';
import { ChannelConnectionHealthProvider } from './channel-connection-health.provider';
import { ChannelsRepository } from './channels.repository';
import { EvolutionInstanceDiscoveryProvider } from './evolution-instance-discovery.provider';
import { ChannelWebhookEventsPageDto, ChannelWebhookEventsQueryDto, EvolutionInstanceListDto, EvolutionWebhookConfigurationDto } from './channels.dto';
import { CHANNEL_CONNECTION_STATUS, CHANNEL_PROVIDER } from './channels.constants';
import { EvolutionWebhookConfigurationProvider } from './evolution-webhook-configuration.provider';
import { EvolutionConnectionProvider, EvolutionConnectionResultDto } from './evolution-connection.provider';

@Injectable()
export class ChannelsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ChannelsRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly healthProvider: ChannelConnectionHealthProvider, private readonly evolutionDiscovery: EvolutionInstanceDiscoveryProvider, private readonly evolutionWebhookConfiguration: EvolutionWebhookConfigurationProvider, private readonly evolutionConnection: EvolutionConnectionProvider) {}
  async list(request: ApiRequestDto): Promise<ChannelRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    return this.repository.list(context.organizationId);
  }
  async create(request: ApiRequestDto, input: CreateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.create(new ChannelRepositoryCreateDto(context.organizationId, context.userId, input, request.correlationId));
    if (result === 'duplicate') throw new ConflictException({ code: 'CHANNEL_ALREADY_CONFIGURED', message: 'The phone number or provider channel is already configured in this organization.' });
    return result;
  }
  async update(request: ApiRequestDto, channelId: string, input: UpdateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.update(new ChannelRepositoryUpdateDto(context.organizationId, channelId, context.userId, input, request.correlationId));
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }
  async configureCredentials(request: ApiRequestDto, channelId: string, credentials: ChannelCredentialsDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const encrypted = this.credentialCrypto.encrypt(context.organizationId, channelId, credentials);
    const result = await this.repository.saveCredentials(new ChannelRepositoryCredentialsDto(context.organizationId, channelId, context.userId, credentials.provider, encrypted, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (result === 'provider_mismatch') throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The credentials do not match this channel provider.' });
    return result;
  }

  async healthCheck(request: ApiRequestDto, channelId: string): Promise<ChannelHealthCheckDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    const result = await this.checkHealthForOrganization(context.organizationId, channelId, context.userId, request.correlationId);
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }

  async discoverEvolutionInstances(request: ApiRequestDto, channelId: string): Promise<EvolutionInstanceListDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_DISCOVERY_PROVIDER_REQUIRED', message: 'Instance discovery requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before discovering instances.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = this.credentialCrypto.decrypt(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    const instances = await this.evolutionDiscovery.list(credentials);
    return new EvolutionInstanceListDto(channelId, instances);
  }

  async configureEvolutionWebhook(request: ApiRequestDto, channelId: string): Promise<EvolutionWebhookConfigurationDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_WEBHOOK_PROVIDER_REQUIRED', message: 'Webhook configuration requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before configuring its webhook.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = this.credentialCrypto.decrypt(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    await this.evolutionWebhookConfiguration.configure(credentials, target.providerChannelId, channelId);
    const configuredAt = new Date();
    const audited = await this.repository.auditEvolutionWebhookConfigured(context.organizationId, channelId, context.userId, configuredAt, request.correlationId);
    if (!audited) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return new EvolutionWebhookConfigurationDto(true, configuredAt.toISOString());
  }

  async connectEvolution(request: ApiRequestDto, channelId: string): Promise<EvolutionConnectionResultDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    if (!target.isActive) throw new ConflictException({ code: 'CHANNEL_DISABLED', message: 'Enable the channel before connecting its Evolution instance.' });
    if (target.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'EVOLUTION_CONNECT_PROVIDER_REQUIRED', message: 'WhatsApp pairing requires an Evolution API channel.' });
    if (!target.credentials) throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure Evolution API credentials before connecting its instance.' });
    let credentials: ChannelCredentialsDto;
    try { credentials = this.credentialCrypto.decrypt(context.organizationId, channelId, target.credentials); }
    catch { throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_INVALID', message: 'Evolution API credentials could not be decrypted.' }); }
    if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The stored credentials do not match the Evolution API provider.' });
    const instances = await this.evolutionDiscovery.list(credentials);
    const instanceExists = instances.some((instance) => instance.instanceName === target.providerChannelId);
    let providerResult = instanceExists
      ? await this.evolutionConnection.connect(target.providerChannelId, credentials)
      : await this.evolutionConnection.create(target.providerChannelId, credentials);
    let webhookConfigured = false;
    try {
      await this.evolutionWebhookConfiguration.configure(credentials, target.providerChannelId, channelId);
      webhookConfigured = true;
      const configuredAt = new Date();
      await this.repository.auditEvolutionWebhookConfigured(context.organizationId, channelId, context.userId, configuredAt, request.correlationId);
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
    const audited = await this.repository.auditEvolutionConnectionRequested(context.organizationId, channelId, context.userId, result.status, requestedAt, request.correlationId);
    if (!audited) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }

  async listWebhookEvents(request: ApiRequestDto, channelId: string, query: ChannelWebhookEventsQueryDto): Promise<ChannelWebhookEventsPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return this.repository.listWebhookEvents(context.organizationId, channelId, query);
  }

  async recordEvolutionConnectionStatus(organizationId: string, channelId: string, status: ChannelConnectionStatus, updatedAt = new Date()): Promise<void> {
    await this.repository.setEvolutionConnectionStatus(new ChannelConnectionStatusUpdateDto(organizationId, channelId, status, updatedAt));
  }

  async checkHealthForOrganization(organizationId: string, channelId: string, userId: string, correlationId: string | null): Promise<ChannelHealthCheckDto | null> {
    const target = await this.repository.healthCheckTarget(organizationId, channelId);
    if (!target) return null;

    let status: ChannelHealthStatus = CHANNEL_HEALTH_STATUS.notConfigured;
    if (target.credentials) {
      let credentials: ChannelCredentialsDto | null = null;
      try {
        credentials = this.credentialCrypto.decrypt(organizationId, channelId, target.credentials);
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
    const audited = await this.repository.auditHealthCheck(new ChannelHealthCheckAuditDto(organizationId, channelId, userId, status, checkedAt, correlationId));
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
