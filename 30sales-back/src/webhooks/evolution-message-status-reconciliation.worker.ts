import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EVOLUTION_STATUS_RECONCILIATION } from './provider-webhook-events.constants';
import { WebhooksRepository } from './webhooks.repository';

@Injectable()
export class EvolutionMessageStatusReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvolutionMessageStatusReconciliationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: WebhooksRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.reconcile() }, EVOLUTION_STATUS_RECONCILIATION.pollIntervalMs);
    this.timer.unref();
    void this.reconcile();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async reconcile(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const result = await this.repository.reconcilePendingEvolutionMessageStatuses();
      const payloadErrors = result.reviewEvents.filter((e) => e.errorCode === EVOLUTION_STATUS_RECONCILIATION.invalidPayloadErrorCode);
      const unmatchedExhausted = result.reviewEvents.filter((e) => e.errorCode === EVOLUTION_STATUS_RECONCILIATION.unmatchedErrorCode);
      if (payloadErrors.length > EVOLUTION_STATUS_RECONCILIATION.minimumResultCount) this.logger.warn(JSON.stringify({
        event: 'evolution_message_status_reconciliation',
        outcome: 'payload_error',
        reconciledCount: result.reconciled,
        reviewEventCount: payloadErrors.length,
        reviewEvents: payloadErrors,
      }));
      if (unmatchedExhausted.length > EVOLUTION_STATUS_RECONCILIATION.minimumResultCount) this.logger.debug(JSON.stringify({
        event: 'evolution_message_status_reconciliation',
        outcome: 'review_required',
        reconciledCount: result.reconciled,
        reviewEventCount: unmatchedExhausted.length,
        reviewEvents: unmatchedExhausted,
      }));
    } catch {
      this.logger.error('Evolution message status reconciliation polling failed.');
    } finally {
      this.processing = false;
    }
  }
}
