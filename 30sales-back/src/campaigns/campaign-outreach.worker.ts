import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelsService } from '../channels/channels.service';
import { CHANNEL_HEALTH_STATUS } from '../channels/channels.dto';
import { WhatsappTextProviderService } from '../inbox/whatsapp-text-provider.service';
import { CampaignsRepository } from './campaigns.repository';

@Injectable()
export class CampaignOutreachWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignOutreachWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: CampaignsRepository, private readonly credentialResolver: ChannelCredentialResolverService, private readonly textProvider: WhatsappTextProviderService, private readonly channelsService: ChannelsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processNext() }, 1000);
    this.timer.unref();
    void this.processNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    let outreach: Awaited<ReturnType<CampaignsRepository['prepareNextOutreach']>> = null;
    try {
      outreach = await this.repository.prepareNextOutreach();
      if (!outreach) return;
      const health = await this.channelsService.checkHealthForOrganization(outreach.organizationId, outreach.channelId, outreach.actorUserId, outreach.actorCanManageAllLines, null);
      const providerReady = outreach.provider === 'evolution' ? health?.status === CHANNEL_HEALTH_STATUS.connected : health?.status === CHANNEL_HEALTH_STATUS.reachable;
      if (!providerReady) {
        await this.repository.finishOutreach({ ...outreach, deliveryState: 'failed', externalMessageId: null });
        return;
      }
      const credentials = await this.credentialResolver.resolve(outreach.organizationId, outreach.channelId, outreach.credentials);
      const result = await this.textProvider.send({ provider: outreach.provider, providerChannelId: outreach.providerChannelId, recipientPhone: outreach.recipientPhone, bodyText: outreach.bodyText, credentials });
      await this.repository.finishOutreach({ ...outreach, deliveryState: result.deliveryState, externalMessageId: result.externalMessageId });
    } catch (error) {
      if (outreach) {
        try { await this.repository.finishOutreach({ ...outreach, deliveryState: 'unknown', externalMessageId: null }); }
        catch { this.logger.error('Campaign outreach could not be recorded after an ambiguous provider outcome.'); }
      }
      this.logger.error(`Campaign outreach stopped for manual review: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }
}
