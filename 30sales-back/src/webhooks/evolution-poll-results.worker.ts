import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { WebhooksRepository } from './webhooks.repository';
import { EvolutionPollResultsProvider } from './evolution-poll-results.provider';

@Injectable()
export class EvolutionPollResultsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvolutionPollResultsWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: WebhooksRepository, private readonly credentialResolver: ChannelCredentialResolverService, private readonly provider: EvolutionPollResultsProvider) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processNext() }, 1_000);
    this.timer.unref();
    void this.processNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    let job: Awaited<ReturnType<WebhooksRepository['claimEvolutionPollResultsRefresh']>> = null;
    try {
      job = await this.repository.claimEvolutionPollResultsRefresh();
      if (!job) return;
      const context = await this.repository.evolutionPollResultsRefreshContext(job);
      if (!context || !context.externalConversationId) {
        await this.repository.setEvolutionPollResultsStatus({ organizationId: job.organizationId, pollMessageId: job.pollMessageId, status: 'failed' });
        await this.repository.completeEvolutionPollResultsRefresh(job);
        return;
      }
      const credentials = await this.credentialResolver.resolve(job.organizationId, context.channelId, context.credentials);
      if (credentials.provider !== 'evolution') throw new Error('EVOLUTION_POLL_CHANNEL_PROVIDER_MISMATCH');
      const outcome = await this.provider.getVotes({ baseUrl: credentials.baseUrl, apiKey: credentials.apiKey, instanceName: context.providerChannelId, remoteJid: context.externalConversationId, pollMessageId: context.externalPollMessageId });
      if (outcome.kind === 'unsupported') {
        await this.repository.setEvolutionPollResultsStatus({ organizationId: job.organizationId, pollMessageId: job.pollMessageId, status: 'unsupported' });
        await this.repository.completeEvolutionPollResultsRefresh(job);
      } else if (outcome.kind === 'retry') {
        await this.repository.failEvolutionPollResultsRefresh({ ...job, errorCode: 'EVOLUTION_POLL_RESULTS_UNAVAILABLE' });
      } else {
        await this.repository.setEvolutionPollResultsStatus({ organizationId: job.organizationId, pollMessageId: job.pollMessageId, status: 'available', results: outcome.results });
        await this.repository.completeEvolutionPollResultsRefresh(job);
      }
    } catch {
      if (job) {
        try { await this.repository.failEvolutionPollResultsRefresh({ ...job, errorCode: 'EVOLUTION_POLL_RESULTS_FAILED' }); }
        catch { this.logger.error('Evolution poll result job could not be scheduled for retry.'); }
      }
      this.logger.error('Evolution poll result job failed; retry policy applied.');
    } finally {
      this.processing = false;
    }
  }
}
