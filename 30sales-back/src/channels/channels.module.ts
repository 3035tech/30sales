import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';
import { ChannelCredentialCryptoService } from './channel-credential-crypto.service';
import { ChannelConnectionHealthProvider } from './channel-connection-health.provider';
import { EvolutionInstanceDiscoveryProvider } from './evolution-instance-discovery.provider';
import { EvolutionWebhookConfigurationProvider } from './evolution-webhook-configuration.provider';
import { EvolutionConnectionProvider } from './evolution-connection.provider';

@Module({ controllers: [ChannelsController], providers: [ChannelsService, ChannelsRepository, ChannelCredentialCryptoService, ChannelConnectionHealthProvider, EvolutionInstanceDiscoveryProvider, EvolutionWebhookConfigurationProvider, EvolutionConnectionProvider], exports: [ChannelsService, ChannelCredentialCryptoService] })
export class ChannelsModule {}
