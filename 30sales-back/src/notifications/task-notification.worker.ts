import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class TaskNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskNotificationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: NotificationsRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processOverdueTasks(); }, 30_000);
    this.timer.unref();
    void this.processOverdueTasks();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processOverdueTasks(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.repository.processOverdueTaskNotifications();
    } catch (error) {
      this.logger.error(`Task notification polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }
}
