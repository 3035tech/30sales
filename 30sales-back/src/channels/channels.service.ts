import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ChannelCredentialsDto, ChannelHealthCheckAuditDto, ChannelHealthCheckDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryUpdateDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import type { ChannelHealthStatus } from './channels.dto';
import { ChannelCredentialCryptoService } from './channel-credential-crypto.service';
import { ChannelConnectionHealthProvider } from './channel-connection-health.provider';
import { ChannelsRepository } from './channels.repository';

@Injectable()
export class ChannelsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ChannelsRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly healthProvider: ChannelConnectionHealthProvider) {}
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
    const target = await this.repository.healthCheckTarget(context.organizationId, channelId);
    if (!target) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });

    let status: ChannelHealthStatus = 'not_configured';
    if (target.credentials) {
      let credentials: ChannelCredentialsDto | null = null;
      try {
        credentials = this.credentialCrypto.decrypt(context.organizationId, channelId, target.credentials);
      } catch {
        status = 'configuration_error';
      }
      if (credentials) {
        try { status = await this.healthProvider.check(target, credentials); }
        catch { status = 'unavailable'; }
      }
    }

    const checkedAt = new Date();
    const audited = await this.repository.auditHealthCheck(new ChannelHealthCheckAuditDto(context.organizationId, channelId, context.userId, status, checkedAt, request.correlationId));
    if (!audited) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return new ChannelHealthCheckDto(status, checkedAt.toISOString());
  }
}
