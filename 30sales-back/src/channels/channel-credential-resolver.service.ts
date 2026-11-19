import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { ChannelsRepository } from './channels.repository';
import { ChannelCredentialCryptoService, type EncryptedChannelCredentials } from './channel-credential-crypto.service';
import { channelCredentialsSchema, platformEvolutionSecretsSchema, type ChannelCredentialsDto } from './channels.dto';
import { CHANNEL_PROVIDER } from './channels.constants';

const channelEvolutionSecretSchema = z.object({ provider: z.literal(CHANNEL_PROVIDER.evolution), webhookSecret: z.string().min(32).max(500) }).strict();

@Injectable()
export class ChannelCredentialResolverService {
  constructor(private readonly repository: ChannelsRepository, private readonly credentialCrypto: ChannelCredentialCryptoService) {}

  async resolve(organizationId: string, channelId: string, encrypted: EncryptedChannelCredentials): Promise<ChannelCredentialsDto> {
    const plaintext = this.credentialCrypto.decryptPayload(organizationId, channelId, encrypted);
    let payload: unknown;
    try { payload = JSON.parse(plaintext) as unknown; }
    catch { throw this.configurationUnavailable(); }

    const existingCredentials = channelCredentialsSchema.safeParse(payload);
    if (existingCredentials.success) return existingCredentials.data;

    const channelSecret = channelEvolutionSecretSchema.safeParse(payload);
    if (!channelSecret.success) throw this.configurationUnavailable();
    const configuration = await this.repository.platformEvolutionCredentials();
    if (!configuration) throw this.configurationUnavailable();
    try {
      const secrets = platformEvolutionSecretsSchema.parse(JSON.parse(this.credentialCrypto.decryptPayload('platform', 'evolution', configuration)) as unknown);
      return { provider: CHANNEL_PROVIDER.evolution, baseUrl: configuration.baseUrl, apiKey: secrets.apiKey, webhookSecret: channelSecret.data.webhookSecret };
    } catch {
      throw this.configurationUnavailable();
    }
  }

  private configurationUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ code: 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID', message: 'The platform Evolution API configuration is unavailable or invalid.' });
  }
}
