import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebhooksRepository } from './webhooks.repository';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class EvolutionHistoryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvolutionHistoryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: WebhooksRepository, private readonly webhooks: WebhooksService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processNext() }, 2_000);
    this.timer.unref();
    void this.processNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const batch = await this.repository.claimEvolutionHistoryBatch();
      if (!batch) return;
      try {
        await this.webhooks.processEvolutionHistoryBatch(batch);
        await this.repository.completeEvolutionHistoryBatch(batch);
      } catch (error) {
        const code = error instanceof Error && error.message === 'EVOLUTION_HISTORY_PAYLOAD_INVALID' ? error.message : 'EVOLUTION_HISTORY_BATCH_FAILED';
        await this.repository.failEvolutionHistoryBatch(batch, code);
        this.logger.error(`Evolution history batch failed (${code}); batch ${batch.id} will follow its retry policy.`);
      }
    } catch (error) {
      this.logger.error(`Evolution history polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }
}
