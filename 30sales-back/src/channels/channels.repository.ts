import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, messagingChannels } from '../db/schema';
import { ChannelHealthCheckAuditDto, ChannelHealthCheckTargetDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryUpdateDto } from './channels.dto';

@Injectable()
export class ChannelsRepository {
  async list(organizationId: string): Promise<ChannelRecordDto[]> {
    const rows = await database.select().from(messagingChannels).where(eq(messagingChannels.organizationId, organizationId)).orderBy(desc(messagingChannels.isActive), messagingChannels.displayName, messagingChannels.id);
    return rows.map((row) => this.toDto(row));
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
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, beforeState: { displayName: before.displayName, isActive: before.isActive }, afterState: { displayName: row.displayName, isActive: row.isActive } });
      return this.toDto(row);
    });
  }

  async saveCredentials(input: ChannelRepositoryCredentialsDto): Promise<ChannelRecordDto | 'not_found' | 'provider_mismatch'> {
    return database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(messagingChannels).where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('update').limit(1);
      if (!before) return 'not_found';
      if (before.provider !== input.provider) return 'provider_mismatch';
      const [row] = await transaction.update(messagingChannels).set({ credentialsCiphertext: input.encrypted.ciphertext, credentialsIv: input.encrypted.iv, credentialsAuthTag: input.encrypted.authTag, updatedAt: new Date() })
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.credentials_updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, afterState: { provider: row.provider, credentialsConfigured: true } });
      return this.toDto(row);
    });
  }

  async healthCheckTarget(organizationId: string, channelId: string): Promise<ChannelHealthCheckTargetDto | null> {
    const [row] = await database.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId,
      credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId))).limit(1);
    if (!row) return null;
    const credentials = row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag
      ? { ciphertext: row.credentialsCiphertext, iv: row.credentialsIv, authTag: row.credentialsAuthTag }
      : null;
    return new ChannelHealthCheckTargetDto(row.id, row.provider as ChannelRecordDto['provider'], row.providerChannelId, credentials);
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

  private toDto(row: typeof messagingChannels.$inferSelect): ChannelRecordDto {
    return new ChannelRecordDto(row.id, row.provider as ChannelRecordDto['provider'], row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.createdAt.toISOString(), row.updatedAt.toISOString(), Boolean(row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag));
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
