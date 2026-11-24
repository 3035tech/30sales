import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { interval, map, merge, Observable, Subject, Subscription } from 'rxjs';
import { pool } from '../db';
import { InboxRepository } from './inbox.repository';
import { z } from 'zod';

const channelName = 'sales_inbox_updates';
const listenerHeartbeatIntervalMs = 60_000;
const inboxUpdateSchema = z.object({ organizationId: z.string().uuid(), conversationId: z.string().uuid(), occurredAt: z.string().datetime() }).strict();
const inboxPresenceSchema = z.object({ type: z.literal('presence'), organizationId: z.string().uuid(), conversationId: z.string().uuid(), state: z.enum(['composing', 'recording', 'paused', 'available', 'unavailable']), participantId: z.string().max(250).nullable(), occurredAt: z.string().datetime() }).strict();
type InboxUpdate = z.infer<typeof inboxUpdateSchema>;
type InboxSubscriber = { readonly subject: Subject<MessageEvent>; readonly userId: string };

@Injectable()
export class InboxRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxRealtimeService.name);
  private readonly subscribers = new Map<string, Set<InboxSubscriber>>();
  private listener: PoolClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private listenerHeartbeat: NodeJS.Timeout | null = null;
  private heartbeatInFlight = false;
  private connecting = false;
  private shuttingDown = false;

  constructor(private readonly repository: InboxRepository) {}

  onModuleInit(): void { void this.connect() }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.listenerHeartbeat) clearInterval(this.listenerHeartbeat);
    const listener = this.listener;
    this.listener = null;
    listener?.release();
    for (const organizationSubscribers of this.subscribers.values()) for (const subscriber of organizationSubscribers) subscriber.subject.complete();
    this.subscribers.clear();
  }

  stream(organizationId: string, userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const subject = new Subject<MessageEvent>();
      const organizationSubscribers = this.subscribers.get(organizationId) ?? new Set<InboxSubscriber>();
      const subscriber = { subject, userId };
      organizationSubscribers.add(subscriber);
      this.subscribers.set(organizationId, organizationSubscribers);
      const heartbeat = interval(20000).pipe(map(() => ({ type: 'heartbeat', data: { connected: true } })));
      const subscription: Subscription = merge(subject, heartbeat).subscribe(observer);
      observer.next({ type: 'ready', data: { connected: true } });
      return () => {
        subscription.unsubscribe();
        organizationSubscribers.delete(subscriber);
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
      const listener = client;
      await listener.query(`LISTEN ${channelName}`);
      this.listener = listener;
      listener.on('notification', (notification) => this.handleNotification(notification.channel, notification.payload));
      listener.on('error', (error: Error) => {
        this.disconnect(listener, error);
      });
      listener.on('end', () => this.disconnect(listener));
      this.listenerHeartbeat = setInterval(() => void this.pingListener(listener), listenerHeartbeatIntervalMs);
    } catch (error) {
      client?.release(error instanceof Error ? error : undefined);
      this.logger.error(`Could not start PostgreSQL inbox event listener: ${error instanceof Error ? error.message : 'unknown error'}`);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private async pingListener(client: PoolClient): Promise<void> {
    if (this.listener !== client || this.heartbeatInFlight || this.shuttingDown) return;
    this.heartbeatInFlight = true;
    try {
      await client.query('SELECT 1');
    } catch (error) {
      this.disconnect(client, error instanceof Error ? error : new Error('unknown error'));
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private disconnect(client: PoolClient, error?: Error): void {
    if (this.listener !== client) return;
    this.listener = null;
    if (this.listenerHeartbeat) clearInterval(this.listenerHeartbeat);
    this.listenerHeartbeat = null;
    this.heartbeatInFlight = false;
    if (error) this.logger.warn(`PostgreSQL inbox event listener disconnected; reconnecting: ${error.message}`);
    client.release(error);
    this.scheduleReconnect();
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
    try {
      const parsed: unknown = JSON.parse(payload);
      const presence = inboxPresenceSchema.safeParse(parsed);
      if (presence.success) {
        void this.broadcastPresence(presence.data);
        return;
      }
      const result = inboxUpdateSchema.safeParse(parsed);
      if (!result.success) return;
      void this.broadcastUpdate(result.data);
    } catch { return }
  }

  private async broadcastPresence(update: z.infer<typeof inboxPresenceSchema>): Promise<void> {
    try {
      const subscribers = this.subscribers.get(update.organizationId) ?? [];
      await Promise.all([...subscribers].map(async (subscriber) => {
        if (!await this.repository.canAccessConversationLine(update.organizationId, update.conversationId, subscriber.userId)) return;
        subscriber.subject.next({ type: 'conversation.presence', data: update });
      }));
    } catch (error) {
      this.logger.warn(`Could not route inbox presence: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async broadcastUpdate(update: InboxUpdate): Promise<void> {
    try {
      const subscribers = this.subscribers.get(update.organizationId) ?? [];
      await Promise.all([...subscribers].map(async (subscriber) => {
        if (!await this.repository.canAccessConversationLine(update.organizationId, update.conversationId, subscriber.userId)) return;
        subscriber.subject.next({ type: 'conversation.updated', data: update });
      }));
    } catch (error) {
      this.logger.warn(`Could not route inbox update: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
