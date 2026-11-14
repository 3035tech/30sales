import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, messagingChannels } from '../db/schema';
import { ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryUpdateDto } from './channels.dto';

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

  private toDto(row: typeof messagingChannels.$inferSelect): ChannelRecordDto {
    return new ChannelRecordDto(row.id, row.provider as ChannelRecordDto['provider'], row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.createdAt.toISOString(), row.updatedAt.toISOString());
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
