import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORGANIZATION_ROLE } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantContextDto } from '../leads/leads.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ChannelConnectionHealthProvider } from './channel-connection-health.provider';
import { ChannelCredentialCryptoService } from './channel-credential-crypto.service';
import { ChannelCredentialResolverService } from './channel-credential-resolver.service';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';
import { EvolutionConnectionProvider } from './evolution-connection.provider';
import { EvolutionInstanceDiscoveryProvider } from './evolution-instance-discovery.provider';
import { EvolutionWebhookConfigurationProvider } from './evolution-webhook-configuration.provider';
import { ChannelHealthCheckTargetDto } from './channels.dto';

jest.mock('../leads/tenant-access.service', () => ({ TenantAccessService: class TenantAccessService {} }));
jest.mock('./channels.repository', () => ({ ChannelsRepository: class ChannelsRepository {} }));
jest.mock('./channel-connection-health.provider', () => ({ ChannelConnectionHealthProvider: class ChannelConnectionHealthProvider {} }));
jest.mock('./channel-credential-crypto.service', () => ({ ChannelCredentialCryptoService: class ChannelCredentialCryptoService {} }));
jest.mock('./channel-credential-resolver.service', () => ({ ChannelCredentialResolverService: class ChannelCredentialResolverService {} }));
jest.mock('./evolution-instance-discovery.provider', () => ({ EvolutionInstanceDiscoveryProvider: class EvolutionInstanceDiscoveryProvider {} }));
jest.mock('./evolution-webhook-configuration.provider', () => ({ EvolutionWebhookConfigurationProvider: class EvolutionWebhookConfigurationProvider {} }));
jest.mock('./evolution-connection.provider', () => ({ EvolutionConnectionProvider: class EvolutionConnectionProvider {} }));

describe('ChannelsService', () => {
  const organizationId = '85422000-0000-4000-8000-000000000001';
  const userId = '85422000-0000-4000-8000-000000000002';
  const channelId = '85422000-0000-4000-8000-000000000003';
  const request = new ApiRequestDto({ 'x-correlation-id': 'channels-access-test' });

  let service: ChannelsService;
  let tenantAccess: jest.Mocked<TenantAccessService>;
  let repository: jest.Mocked<ChannelsRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: TenantAccessService, useValue: { require: jest.fn() } },
        {
          provide: ChannelsRepository,
          useValue: {
            canAccessChannel: jest.fn(),
            update: jest.fn(),
            healthCheckTarget: jest.fn(),
            platformEvolutionCredentials: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        { provide: ChannelCredentialCryptoService, useValue: { decryptPayload: jest.fn() } },
        { provide: ChannelCredentialResolverService, useValue: {} },
        { provide: ChannelConnectionHealthProvider, useValue: {} },
        { provide: EvolutionInstanceDiscoveryProvider, useValue: {} },
        { provide: EvolutionWebhookConfigurationProvider, useValue: {} },
        { provide: EvolutionConnectionProvider, useValue: { delete: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ChannelsService);
    tenantAccess = moduleRef.get(TenantAccessService);
    repository = moduleRef.get(ChannelsRepository);
  });

  it('hides a channel outside the member business lines and does not attempt the update', async () => {
    tenantAccess.require.mockResolvedValue(new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.sdr));
    repository.canAccessChannel.mockResolvedValue(false);

    await expect(service.update(request, channelId, { displayName: 'Updated channel' })).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.canAccessChannel).toHaveBeenCalledWith(organizationId, channelId, userId, false);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('archives the local channel when Evolution rejects provider deletion', async () => {
    tenantAccess.require.mockResolvedValue(new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.owner));
    repository.canAccessChannel.mockResolvedValue(true);
    repository.healthCheckTarget.mockResolvedValue(new ChannelHealthCheckTargetDto(channelId, 'evolution', 'unpaired-instance', true, null));
    repository.platformEvolutionCredentials.mockResolvedValue({ baseUrl: 'https://evolution.example.com', ciphertext: 'encrypted', iv: 'iv', authTag: 'tag' });
    const crypto = service['credentialCrypto'] as jest.Mocked<ChannelCredentialCryptoService>;
    crypto.decryptPayload.mockReturnValue(JSON.stringify({ apiKey: 'invalid-key' }));
    const evolutionConnection = service['evolutionConnection'] as jest.Mocked<EvolutionConnectionProvider>;
    evolutionConnection.delete.mockRejectedValue(new ServiceUnavailableException());
    repository.softDelete.mockResolvedValue(true);

    await expect(service.delete(request, channelId)).resolves.toEqual({ deleted: true, historyPreserved: true, remoteInstanceDeleted: false });
    expect(evolutionConnection.delete).toHaveBeenCalled();
    expect(repository.softDelete).toHaveBeenCalled();
    expect(repository.softDelete.mock.calls[0]?.[0].remoteInstanceDeleted).toBe(false);
  });
});
