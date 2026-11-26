import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { auditEvents, conversations, messageAttachments, messages, messagingChannels, userNotifications } from '../db/schema';
import { USER_NOTIFICATION_TYPE } from '../notifications/notifications.constants.js';
import { MediaAttachmentDownloadDto, MediaAttachmentWorkDto, RetryMediaAttachmentDto } from './attachments.dto';

@Injectable()
export class AttachmentsRepository {
  async claimPending(limit = 10): Promise<MediaAttachmentWorkDto[]> {
    return database.transaction(async (transaction) => {
      const now = new Date();
      const rows = await transaction.select({
        id: messageAttachments.id, organizationId: messageAttachments.organizationId, channelId: messageAttachments.channelId,
        provider: messageAttachments.provider, providerChannelId: messagingChannels.providerChannelId, conversationId: messages.conversationId,
        mediaType: messageAttachments.mediaType, sourceMediaId: messageAttachments.sourceMediaId, sourceCiphertext: messageAttachments.sourceCiphertext,
        sourceIv: messageAttachments.sourceIv, sourceAuthTag: messageAttachments.sourceAuthTag,
        credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag,
        mimeType: messageAttachments.mimeType, fileName: messageAttachments.fileName, sizeBytes: messageAttachments.sizeBytes,
        sha256: messageAttachments.sha256, attemptCount: messageAttachments.attemptCount,
      }).from(messageAttachments)
        .innerJoin(messages, and(eq(messages.id, messageAttachments.messageId), eq(messages.organizationId, messageAttachments.organizationId)))
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, messageAttachments.channelId), eq(messagingChannels.organizationId, messageAttachments.organizationId)))
        .where(and(eq(messages.isDeleted, false), eq(messagingChannels.isActive, true), isNotNull(messagingChannels.credentialsCiphertext), isNotNull(messagingChannels.credentialsIv), isNotNull(messagingChannels.credentialsAuthTag),
          lte(messageAttachments.availableAt, now), or(eq(messageAttachments.status, 'pending'), and(eq(messageAttachments.status, 'processing'), lte(messageAttachments.lockedUntil, now)))))
        .orderBy(asc(messageAttachments.availableAt), asc(messageAttachments.id)).limit(limit).for('update', { of: messageAttachments, skipLocked: true });
      if (!rows.length) return [];
      const lockedUntil = new Date(now.getTime() + 180_000);
      await transaction.update(messageAttachments).set({ status: 'processing', attemptCount: sql`${messageAttachments.attemptCount} + 1`, lockedUntil, updatedAt: now })
        .where(and(inArray(messageAttachments.id, rows.map((row) => row.id)), inArray(messageAttachments.organizationId, [...new Set(rows.map((row) => row.organizationId))])));
      return rows.flatMap((row) => row.sourceCiphertext && row.sourceIv && row.sourceAuthTag && row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag
        ? [new MediaAttachmentWorkDto(row.id, row.organizationId, row.channelId, row.provider, row.providerChannelId, row.conversationId,
          row.mediaType, row.sourceMediaId, row.sourceCiphertext, row.sourceIv, row.sourceAuthTag, row.credentialsCiphertext, row.credentialsIv,
          row.credentialsAuthTag, row.mimeType, row.fileName, row.sizeBytes, row.sha256, row.attemptCount + 1)] : []);
    });
  }

  async markAvailable(input: MediaAttachmentWorkDto, storageKey: string, mimeType: string | null, fileName: string | null, sizeBytes: number, sha256: string): Promise<void> {
    await database.transaction(async (transaction) => {
      await transaction.update(messageAttachments).set({ status: 'available', storageKey, mimeType: mimeType ?? input.mimeType, fileName: fileName ?? input.fileName, sizeBytes, sha256,
        sourceCiphertext: null, sourceIv: null, sourceAuthTag: null, lockedUntil: null, lastErrorCode: null, lastErrorStage: null, updatedAt: new Date() })
        .where(and(eq(messageAttachments.id, input.id), eq(messageAttachments.organizationId, input.organizationId), eq(messageAttachments.status, 'processing')));
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: input.conversationId, occurredAt: new Date().toISOString() })})`);
    });
  }

  async markFailed(input: MediaAttachmentWorkDto, errorCode: string, errorStage: string): Promise<void> {
    const terminal = input.attemptCount >= 5 || ['MEDIA_SIZE_LIMIT_EXCEEDED', 'MEDIA_CHECKSUM_MISMATCH', 'MEDIA_SOURCE_INVALID'].includes(errorCode);
    const shouldNotify = terminal && !['MEDIA_SOURCE_INVALID', 'MEDIA_SIZE_LIMIT_EXCEEDED', 'MEDIA_CHECKSUM_MISMATCH'].includes(errorCode);
    const retryDelaySeconds = Math.min(300, 5 * 2 ** (input.attemptCount - 1));
    await database.transaction(async (transaction) => {
      await transaction.update(messageAttachments).set({ status: terminal ? 'failed' : 'pending', availableAt: new Date(Date.now() + retryDelaySeconds * 1000), lockedUntil: null, lastErrorCode: errorCode, lastErrorStage: errorStage, updatedAt: new Date() })
        .where(and(eq(messageAttachments.id, input.id), eq(messageAttachments.organizationId, input.organizationId), eq(messageAttachments.status, 'processing')));
      if (terminal) await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: input.conversationId, occurredAt: new Date().toISOString() })})`);
      if (shouldNotify) {
        const [conversation] = await transaction.select({ ownerUserId: conversations.ownerUserId }).from(conversations)
          .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1);
        if (conversation?.ownerUserId) {
          await transaction.insert(userNotifications).values({
            organizationId: input.organizationId,
            recipientUserId: conversation.ownerUserId,
            conversationId: input.conversationId,
            notificationType: USER_NOTIFICATION_TYPE.mediaDownloadFailed,
            idempotencyKey: `media-download-failed:${input.id}`,
          }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
        }
      }
    });
  }

  async authorizeDownload(organizationId: string, attachmentId: string, userId: string, correlationId: string | null): Promise<MediaAttachmentDownloadDto | null> {
    return database.transaction(async (transaction) => {
      const [attachment] = await transaction.select({ storageKey: messageAttachments.storageKey, fileName: messageAttachments.fileName, mimeType: messageAttachments.mimeType, status: messageAttachments.status })
        .from(messageAttachments).innerJoin(messages, and(eq(messages.id, messageAttachments.messageId), eq(messages.organizationId, messageAttachments.organizationId)))
        .where(and(eq(messageAttachments.id, attachmentId), eq(messageAttachments.organizationId, organizationId), eq(messages.isDeleted, false), eq(messageAttachments.status, 'available'), isNotNull(messageAttachments.storageKey))).limit(1);
      if (!attachment?.storageKey) return null;
      await transaction.insert(auditEvents).values({ organizationId, actorUserId: userId, actorType: 'user', action: 'message_attachment.download_requested', entityType: 'message_attachment', entityId: attachmentId, correlationId });
      return new MediaAttachmentDownloadDto(attachment.storageKey, attachment.fileName, attachment.mimeType);
    });
  }

  async retryFailed(organizationId: string, attachmentId: string, userId: string, correlationId: string | null): Promise<RetryMediaAttachmentDto | null> {
    return database.transaction(async (transaction) => {
      const [attachment] = await transaction.select({ conversationId: messages.conversationId })
        .from(messageAttachments)
        .innerJoin(messages, and(eq(messages.id, messageAttachments.messageId), eq(messages.organizationId, messageAttachments.organizationId)))
        .where(and(eq(messageAttachments.id, attachmentId), eq(messageAttachments.organizationId, organizationId), eq(messages.isDeleted, false), eq(messageAttachments.status, 'failed'),
          isNotNull(messageAttachments.sourceCiphertext), isNotNull(messageAttachments.sourceIv), isNotNull(messageAttachments.sourceAuthTag)))
        .limit(1).for('update', { of: messageAttachments });
      if (!attachment) return null;
      await transaction.update(messageAttachments).set({ status: 'pending', attemptCount: 0, availableAt: new Date(), lockedUntil: null, lastErrorCode: null, lastErrorStage: null, updatedAt: new Date() })
        .where(and(eq(messageAttachments.id, attachmentId), eq(messageAttachments.organizationId, organizationId), eq(messageAttachments.status, 'failed')));
      await transaction.insert(auditEvents).values({ organizationId, actorUserId: userId, actorType: 'user', action: 'message_attachment.retry_requested', entityType: 'message_attachment', entityId: attachmentId, correlationId });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId, conversationId: attachment.conversationId, occurredAt: new Date().toISOString() })})`);
      return new RetryMediaAttachmentDto(attachmentId, 'pending');
    });
  }
}
