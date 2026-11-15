import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { interval, map, merge, Observable, Subject, Subscription } from 'rxjs';
import { pool } from '../db';

const channelName = 'sales_inbox_updates';
type InboxUpdate = { organizationId: string; conversationId: string; occurredAt: string };

@Injectable()
export class InboxRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxRealtimeService.name);
  private readonly subscribers = new Map<string, Set<Subject<MessageEvent>>>();
  private listener: PoolClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connecting = false;
  private shuttingDown = false;

  onModuleInit(): void { void this.connect() }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.listener?.release();
    this.listener = null;
    for (const organizationSubscribers of this.subscribers.values()) for (const subscriber of organizationSubscribers) subscriber.complete();
    this.subscribers.clear();
  }

  stream(organizationId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const subject = new Subject<MessageEvent>();
      const organizationSubscribers = this.subscribers.get(organizationId) ?? new Set<Subject<MessageEvent>>();
      organizationSubscribers.add(subject);
      this.subscribers.set(organizationId, organizationSubscribers);
      const heartbeat = interval(20000).pipe(map(() => ({ type: 'heartbeat', data: { connected: true } })));
      const subscription: Subscription = merge(subject, heartbeat).subscribe(observer);
      observer.next({ type: 'ready', data: { connected: true } });
      return () => {
        subscription.unsubscribe();
        organizationSubscribers.delete(subject);
        if (organizationSubscribers.size === 0) this.subscribers.delete(organizationId);
        subject.complete();
      };
    });
  }

  private async connect(): Promise<void> {
    if (this.connecting || this.shuttingDown) return;
    this.connecting = true;
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query(`LISTEN ${channelName}`);
      this.listener = client;
      client.on('notification', (notification) => this.handleNotification(notification.channel, notification.payload));
      client.on('error', (error: Error) => {
        this.logger.error(`PostgreSQL inbox event listener disconnected: ${error.message}`);
        if (this.listener === client) this.listener = null;
        client?.release(error);
        this.scheduleReconnect();
      });
    } catch (error) {
      client?.release(error instanceof Error ? error : undefined);
      this.logger.error(`Could not start PostgreSQL inbox event listener: ${error instanceof Error ? error.message : 'unknown error'}`);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 3000);
  }

  private handleNotification(channel: string | undefined, payload: string | undefined): void {
    if (channel !== channelName || !payload) return;
    let update: InboxUpdate;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object') return;
      const candidate = parsed as Partial<InboxUpdate>;
      if (typeof candidate.organizationId !== 'string' || typeof candidate.conversationId !== 'string' || typeof candidate.occurredAt !== 'string') return;
      update = candidate as InboxUpdate;
    } catch { return }
    for (const subscriber of this.subscribers.get(update.organizationId) ?? []) subscriber.next({ type: 'conversation.updated', data: update });
  }
}
