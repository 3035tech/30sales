import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CloserEventsRepository } from './closer-events.repository';

@Injectable()
export class CloserSlaNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloserSlaNotificationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: CloserEventsRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processOverdue() }, 30_000);
    this.timer.unref();
    void this.processOverdue();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processOverdue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.repository.processOverdueSlaNotifications();
    } catch (error) {
      this.logger.error(`Closer SLA notification polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }
}
