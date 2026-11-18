import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { member as authMember } from '../db/auth-schema';
import { auditEvents, conversations, inboxEvents, messages, messagingChannels, userNotifications } from '../db/schema';
import { ChannelConnectionStatusUpdateDto, ChannelHealthCheckAuditDto, ChannelHealthCheckTargetDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryUpdateDto, ChannelWebhookEventsPageDto, ChannelWebhookEventsQueryDto, ChannelWebhookEventRecordDto } from './channels.dto';
import { CHANNEL_AUDIT_ACTION, CHANNEL_CONNECTION_STATUS, CHANNEL_EVENT_ERROR_FALLBACK, CHANNEL_PROVIDER, CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE } from './channels.constants';
import { USER_NOTIFICATION_TYPE } from '../notifications/notifications.constants';

@Injectable()
export class ChannelsRepository {
  async list(organizationId: string): Promise<ChannelRecordDto[]> {
    const rows = await database.select({ channel: messagingChannels, dailyMessageCount: sql<number>`(select count(*)::int from ${messages} inner join ${conversations} on ${conversations.id} = ${messages.conversationId} and ${conversations.organizationId} = ${messages.organizationId} where ${messages.organizationId} = ${messagingChannels.organizationId} and ${conversations.channelId} = ${messagingChannels.id} and ${messages.direction} = ${CHANNEL_QUOTA_COUNTED_DIRECTION} and ${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE} and (${messages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date)` })
      .from(messagingChannels).where(eq(messagingChannels.organizationId, organizationId)).orderBy(desc(messagingChannels.isActive), messagingChannels.displayName, messagingChannels.id);
    return rows.map((row) => this.toDto(row.channel, row.dailyMessageCount));
  }

  async create(input: ChannelRepositoryCreateDto): Promise<ChannelRecordDto | 'duplicate'> {
    try {
      return await database.transaction(async (transaction) => {
        const [row] = await transaction.insert(messagingChannels).values({ organizationId: input.organizationId, provider: input.input.provider, displayName: input.input.displayName, phoneNumber: input.input.phoneNumber, providerChannelId: input.input.providerChannelId, providerAccountId: input.input.providerAccountId || null }).returning();
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.created', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, afterState: { provider: row.provider, displayName: row.displayName, phoneNumber: row.phoneNumber, providerChannelId: row.providerChannelId, providerAccountId: row.providerAccountId, isActive: row.isActive } });
        return this.toDto(row);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  async update(input: ChannelRepositoryUpdateDto): Promise<ChannelRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(messagingChannels).where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('update').limit(1);
      if (!before) return null;
      const [row] = await transaction.update(messagingChannels).set({ ...input.input, updatedAt: new Date() }).where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, beforeState: { displayName: before.displayName, isActive: before.isActive, dailyMessageLimit: before.dailyMessageLimit, dailyLimitTimeZone: before.dailyLimitTimeZone }, afterState: { displayName: row.displayName, isActive: row.isActive, dailyMessageLimit: row.dailyMessageLimit, dailyLimitTimeZone: row.dailyLimitTimeZone } });
      return this.toDto(row);
    });
  }

  async saveCredentials(input: ChannelRepositoryCredentialsDto): Promise<ChannelRecordDto | 'not_found' | 'provider_mismatch'> {
    return database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(messagingChannels).where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('update').limit(1);
      if (!before) return 'not_found';
      if (before.provider !== input.provider) return 'provider_mismatch';
      const [row] = await transaction.update(messagingChannels).set({ credentialsCiphertext: input.encrypted.ciphertext, credentialsIv: input.encrypted.iv, credentialsAuthTag: input.encrypted.authTag, connectionStatus: null, connectionUpdatedAt: null, updatedAt: new Date() })
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.credentials_updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, afterState: { provider: row.provider, credentialsConfigured: true } });
      return this.toDto(row);
    });
  }

  async healthCheckTarget(organizationId: string, channelId: string): Promise<ChannelHealthCheckTargetDto | null> {
    const [row] = await database.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive,
      credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId))).limit(1);
    if (!row) return null;
    const credentials = row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag
      ? { ciphertext: row.credentialsCiphertext, iv: row.credentialsIv, authTag: row.credentialsAuthTag }
      : null;
    return new ChannelHealthCheckTargetDto(row.id, row.provider as ChannelRecordDto['provider'], row.providerChannelId, row.isActive, credentials);
  }

  async evolutionMonitoringTargets(organizationId: string, channelIds: string[]): Promise<ChannelHealthCheckTargetDto[]> {
    if (channelIds.length === 0) return [];
    const rows = await database.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive,
      credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.provider, CHANNEL_PROVIDER.evolution), inArray(messagingChannels.id, channelIds)));
    return rows.map((row) => {
      const credentials = row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag
        ? { ciphertext: row.credentialsCiphertext, iv: row.credentialsIv, authTag: row.credentialsAuthTag }
        : null;
      return new ChannelHealthCheckTargetDto(row.id, CHANNEL_PROVIDER.evolution, row.providerChannelId, row.isActive, credentials);
    });
  }

  async recentFailedDeliveryCounts(organizationId: string, channelIds: string[], since: Date): Promise<Map<string, number>> {
    if (channelIds.length === 0) return new Map();
    const channelId = sql<string>`${inboxEvents.payloadRedacted}->>'channelId'`;
    const deliveryState = sql<string>`${inboxEvents.payloadRedacted}->>'deliveryState'`;
    const channelScope = or(...channelIds.map((id) => eq(channelId, id)));
    const rows = await database.select({ channelId, count: sql<number>`count(*)::int` }).from(inboxEvents)
      .where(and(eq(inboxEvents.organizationId, organizationId), eq(inboxEvents.eventType, 'messages.status'), eq(deliveryState, 'failed'), gte(inboxEvents.receivedAt, since), channelScope))
      .groupBy(channelId);
    return new Map(rows.map((row) => [row.channelId, row.count]));
  }

  async auditHealthCheck(input: ChannelHealthCheckAuditDto): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).limit(1);
      if (!channel) return false;
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user',
        action: 'channel.connection_checked', entityType: 'messaging_channel', entityId: channel.id, correlationId: input.correlationId,
        afterState: { status: input.status, checkedAt: input.checkedAt.toISOString() } });
      return true;
    });
  }

  async auditEvolutionWebhookConfigured(organizationId: string, channelId: string, actorUserId: string, configuredAt: Date, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId))).limit(1);
      if (!channel) return false;
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: CHANNEL_AUDIT_ACTION.evolutionWebhookConfigured, entityType: 'messaging_channel', entityId: channel.id, correlationId, afterState: { configuredAt: configuredAt.toISOString() } });
      return true;
    });
  }

  async auditEvolutionConnectionRequested(organizationId: string, channelId: string, actorUserId: string, status: string, requestedAt: Date, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.provider, CHANNEL_PROVIDER.evolution))).limit(1);
      if (!channel) return false;
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: CHANNEL_AUDIT_ACTION.evolutionConnectionRequested, entityType: 'messaging_channel', entityId: channel.id, correlationId, afterState: { status, requestedAt: requestedAt.toISOString() } });
      return true;
    });
  }

  async setEvolutionConnectionStatus(input: ChannelConnectionStatusUpdateDto): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id, connectionStatus: messagingChannels.connectionStatus }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.provider, CHANNEL_PROVIDER.evolution))).for('update').limit(1);
      if (!channel) return false;
      await transaction.update(messagingChannels).set({ connectionStatus: input.status, connectionUpdatedAt: input.updatedAt, updatedAt: input.updatedAt })
        .where(and(eq(messagingChannels.id, channel.id), eq(messagingChannels.organizationId, input.organizationId)));
      if (input.status === CHANNEL_CONNECTION_STATUS.disconnected && channel.connectionStatus !== CHANNEL_CONNECTION_STATUS.disconnected) {
        const recipients = await transaction.select({ userId: authMember.userId }).from(authMember).where(eq(authMember.organizationId, input.organizationId));
        for (const recipient of recipients) await transaction.insert(userNotifications).values({
          organizationId: input.organizationId,
          recipientUserId: recipient.userId,
          channelId: channel.id,
          notificationType: USER_NOTIFICATION_TYPE.channelDisconnected,
          idempotencyKey: `channel-disconnected:${channel.id}:${input.updatedAt.toISOString()}`,
        }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
      }
      return true;
    });
  }

  async listWebhookEvents(organizationId: string, channelId: string, query: ChannelWebhookEventsQueryDto): Promise<ChannelWebhookEventsPageDto> {
    const channelScope = sql`${inboxEvents.payloadRedacted}->>'channelId' = ${channelId}`;
    const where = and(eq(inboxEvents.organizationId, organizationId), channelScope);
    const [rows, [count]] = await Promise.all([
      database.select({ id: inboxEvents.id, provider: inboxEvents.provider, eventType: inboxEvents.eventType, eventFamily: sql<string>`${inboxEvents.payloadRedacted}->>'eventFamily'`, status: inboxEvents.status, attempts: inboxEvents.attempts, receivedAt: inboxEvents.receivedAt, processedAt: inboxEvents.processedAt, lastErrorCode: inboxEvents.lastErrorCode })
        .from(inboxEvents).where(where).orderBy(desc(inboxEvents.receivedAt), desc(inboxEvents.id)).limit(query.limit).offset(query.offset),
      database.select({ total: sql<number>`count(*)::int` }).from(inboxEvents).where(where),
    ]);
    const data = rows.map((row) => new ChannelWebhookEventRecordDto(row.id, row.provider, row.eventType, row.eventFamily ?? 'other', row.status, Number(row.attempts), row.receivedAt.toISOString(), row.processedAt?.toISOString() ?? null, this.toSafeErrorCode(row.lastErrorCode)));
    return new ChannelWebhookEventsPageDto(data, { limit: query.limit, offset: query.offset, total: count.total, hasNextPage: query.offset + data.length < count.total });
  }

  private toDto(row: typeof messagingChannels.$inferSelect, dailyMessageCount = 0): ChannelRecordDto {
    return new ChannelRecordDto(row.id, row.provider as ChannelRecordDto['provider'], row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.dailyMessageLimit, row.dailyLimitTimeZone, dailyMessageCount, row.createdAt.toISOString(), row.updatedAt.toISOString(), Boolean(row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag), row.connectionStatus as ChannelRecordDto['connectionStatus'], row.connectionUpdatedAt?.toISOString() ?? null);
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private toSafeErrorCode(errorCode: string | null): string | null {
    if (!errorCode) return null;
    return /^[A-Z0-9_.-]{1,80}$/i.test(errorCode) ? errorCode : CHANNEL_EVENT_ERROR_FALLBACK;
  }
}
