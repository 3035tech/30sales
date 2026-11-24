import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { member as authMember } from '../db/auth-schema';
import { assistantProfiles, auditEvents, businessLineMembers, businessLines, channelAssistantScheduleExceptions, channelBusinessHours, conversations, inboxEvents, messages, messagingChannels, platformEvolutionConfiguration, userNotifications } from '../db/schema';
import { channelAssistantScheduleModeSchema, channelConnectionStatusSchema, channelOperationModeSchema, channelProviderSchema, ChannelConnectionStatusUpdateDto, ChannelHealthCheckAuditDto, ChannelHealthCheckTargetDto, ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryCredentialsDto, ChannelRepositoryDeleteDto, ChannelRepositoryDeleteScheduleExceptionDto, ChannelRepositoryScheduleExceptionDto, ChannelRepositoryUpdateDto, ChannelScheduleExceptionDto, ChannelWebhookEventsPageDto, ChannelWebhookEventsQueryDto, ChannelWebhookEventRecordDto } from './channels.dto';
import { CHANNEL_ASSISTANT_SCHEDULE_MODE, CHANNEL_AUDIT_ACTION, CHANNEL_CONNECTION_STATUS, CHANNEL_EVENT_ERROR_FALLBACK, CHANNEL_OPERATION_MODE, CHANNEL_PROVIDER, CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE } from './channels.constants';
import { USER_NOTIFICATION_TYPE } from '../notifications/notifications.constants';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';

function channelMembershipCondition(organizationId: string, userId: string, canManageAllLines: boolean) {
  if (canManageAllLines) return undefined;
  return exists(database.select({ id: businessLineMembers.memberId }).from(businessLineMembers)
    .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
    .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, messagingChannels.businessLineId), eq(authMember.userId, userId))));
}

@Injectable()
export class ChannelsRepository {
  async canAccessChannel(organizationId: string, channelId: string, userId: string, canManageAllLines: boolean): Promise<boolean> {
    const [row] = await database.select({ id: messagingChannels.id }).from(messagingChannels)
      .innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.id, channelId), isNull(messagingChannels.deletedAt), eq(businessLines.status, 'active'), channelMembershipCondition(organizationId, userId, canManageAllLines))).limit(1);
    return row !== undefined;
  }

  private async lockAccessibleChannel(transaction: Parameters<Parameters<typeof database.transaction>[0]>[0], organizationId: string, channelId: string, userId: string, canManageAllLines: boolean) {
    const [channel] = await transaction.select({ channel: messagingChannels, businessLineName: businessLines.name }).from(messagingChannels)
      .innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId), isNull(messagingChannels.deletedAt), eq(businessLines.status, 'active'), channelMembershipCondition(organizationId, userId, canManageAllLines)))
      .for('update', { of: messagingChannels }).limit(1);
    if (!channel) return null;
    if (!channel.channel.businessLineId) return null;
    const [activeLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
      .where(and(eq(businessLines.organizationId, organizationId), eq(businessLines.id, channel.channel.businessLineId), eq(businessLines.status, 'active')))
      .for('share').limit(1);
    if (!activeLine) return null;
    if (!canManageAllLines) {
      const [membership] = await transaction.select({ id: businessLineMembers.memberId }).from(businessLineMembers)
        .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
        .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, activeLine.id), eq(authMember.userId, userId)))
        .for('share', { of: [businessLineMembers, authMember] }).limit(1);
      if (!membership) return null;
    }
    return channel;
  }

  async platformEvolutionCredentials(): Promise<{ baseUrl: string; ciphertext: string; iv: string; authTag: string } | null> {
    const [row] = await database.select({ baseUrl: platformEvolutionConfiguration.baseUrl, ciphertext: platformEvolutionConfiguration.credentialsCiphertext, iv: platformEvolutionConfiguration.credentialsIv, authTag: platformEvolutionConfiguration.credentialsAuthTag }).from(platformEvolutionConfiguration).where(eq(platformEvolutionConfiguration.id, 'default')).limit(1);
    return row ?? null;
  }

  async list(organizationId: string, userId: string, canManageAllLines: boolean, businessLineId?: string): Promise<ChannelRecordDto[]> {
    const quotaMessages = alias(messages, 'quota_messages');
    const quotaConversations = alias(conversations, 'quota_conversations');
    const dailyMessageCount = database.select({ value: sql<number>`count(*)::int` }).from(quotaMessages)
      .innerJoin(quotaConversations, and(eq(quotaConversations.id, quotaMessages.conversationId), eq(quotaConversations.organizationId, quotaMessages.organizationId)))
      .where(and(eq(quotaMessages.organizationId, messagingChannels.organizationId), eq(quotaConversations.channelId, messagingChannels.id), eq(quotaMessages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${quotaMessages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${quotaMessages.occurredAt} at time zone ${messagingChannels.dailyLimitTimeZone})::date = (now() at time zone ${messagingChannels.dailyLimitTimeZone})::date`));
    const lineMembership = exists(database.select({ id: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, messagingChannels.businessLineId), eq(authMember.userId, userId))));
    const rows = await database.select({ channel: messagingChannels, businessLineName: businessLines.name, dailyMessageCount: sql<number>`(${dailyMessageCount})` })
      .from(messagingChannels).leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.organizationId, organizationId), isNull(messagingChannels.deletedAt), businessLineId ? eq(messagingChannels.businessLineId, businessLineId) : undefined, eq(businessLines.status, 'active'), canManageAllLines ? undefined : lineMembership)).orderBy(desc(messagingChannels.isActive), messagingChannels.displayName, messagingChannels.id);
    const hours = await database.select().from(channelBusinessHours).where(eq(channelBusinessHours.organizationId, organizationId));
    const exceptions = rows.length ? await database.select().from(channelAssistantScheduleExceptions)
      .where(and(eq(channelAssistantScheduleExceptions.organizationId, organizationId), inArray(channelAssistantScheduleExceptions.channelId, rows.map(({ channel }) => channel.id))))
      .orderBy(asc(channelAssistantScheduleExceptions.localDate)) : [];
    const hoursByChannel = new Map<string, typeof hours>();
    for (const item of hours) {
      const channelHours = hoursByChannel.get(item.channelId);
      if (channelHours) channelHours.push(item);
      else hoursByChannel.set(item.channelId, [item]);
    }
    const exceptionsByChannel = new Map<string, typeof exceptions>();
    for (const item of exceptions) {
      const channelExceptions = exceptionsByChannel.get(item.channelId);
      if (channelExceptions) channelExceptions.push(item);
      else exceptionsByChannel.set(item.channelId, [item]);
    }
    return rows.map((row) => this.toDto(row.channel, row.dailyMessageCount, hoursByChannel.get(row.channel.id) ?? [], row.businessLineName, (exceptionsByChannel.get(row.channel.id) ?? []).map((item) => new ChannelScheduleExceptionDto(item.id, item.localDate, item.assistantEnabled, item.startTime, item.endTime))));
  }

  async saveScheduleException(input: ChannelRepositoryScheduleExceptionDto): Promise<ChannelScheduleExceptionDto[] | null> {
    return database.transaction(async (transaction) => {
      const locked = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!locked) return null;
      const from = Date.parse(`${input.input.fromDate}T00:00:00.000Z`);
      const to = Date.parse(`${input.input.toDate}T00:00:00.000Z`);
      const dates = Array.from({ length: Math.floor((to - from) / 86_400_000) + 1 }, (_, index) => new Date(from + index * 86_400_000).toISOString().slice(0, 10));
      const before = await transaction.select().from(channelAssistantScheduleExceptions)
        .where(and(eq(channelAssistantScheduleExceptions.organizationId, input.organizationId), eq(channelAssistantScheduleExceptions.channelId, input.channelId), inArray(channelAssistantScheduleExceptions.localDate, dates)));
      const rows = await transaction.insert(channelAssistantScheduleExceptions).values(dates.map((localDate) => ({ organizationId: input.organizationId, channelId: input.channelId, localDate, assistantEnabled: input.input.assistantEnabled, startTime: input.input.startTime, endTime: input.input.endTime })))
        .onConflictDoUpdate({ target: [channelAssistantScheduleExceptions.organizationId, channelAssistantScheduleExceptions.channelId, channelAssistantScheduleExceptions.localDate], set: { assistantEnabled: input.input.assistantEnabled, startTime: input.input.startTime, endTime: input.input.endTime, updatedAt: new Date() } }).returning();
      const exceptions = rows.map((row) => new ChannelScheduleExceptionDto(row.id, row.localDate, row.assistantEnabled, row.startTime, row.endTime));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.schedule_exception_range_saved', entityType: 'messaging_channel', entityId: input.channelId, correlationId: input.correlationId, beforeState: before.map(({ localDate, assistantEnabled, startTime, endTime }) => ({ localDate, assistantEnabled, startTime, endTime })), afterState: exceptions.map(({ localDate, assistantEnabled, startTime, endTime }) => ({ localDate, assistantEnabled, startTime, endTime })) });
      return exceptions;
    });
  }

  async deleteScheduleException(input: ChannelRepositoryDeleteScheduleExceptionDto): Promise<boolean | null> {
    return database.transaction(async (transaction) => {
      const locked = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!locked) return null;
      const [row] = await transaction.delete(channelAssistantScheduleExceptions).where(and(eq(channelAssistantScheduleExceptions.organizationId, input.organizationId), eq(channelAssistantScheduleExceptions.channelId, input.channelId), eq(channelAssistantScheduleExceptions.id, input.exceptionId))).returning();
      if (!row) return false;
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.schedule_exception_deleted', entityType: 'messaging_channel', entityId: input.channelId, correlationId: input.correlationId, beforeState: { localDate: row.localDate, assistantEnabled: row.assistantEnabled, startTime: row.startTime, endTime: row.endTime } });
      return true;
    });
  }

  async create(input: ChannelRepositoryCreateDto): Promise<ChannelRecordDto | 'duplicate' | 'business_line_not_found' | 'business_line_forbidden'> {
    try {
      return await database.transaction(async (transaction) => {
        const [businessLine] = await transaction.select({ id: businessLines.id, name: businessLines.name }).from(businessLines).where(and(eq(businessLines.organizationId, input.organizationId), eq(businessLines.id, input.input.businessLineId), eq(businessLines.status, 'active'))).for('share').limit(1);
        if (!businessLine) return 'business_line_not_found';
        if (!input.canManageAllLines) {
          const [membership] = await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
            .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
            .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
            .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, businessLine.id), eq(authMember.userId, input.actorUserId), eq(businessLines.status, 'active'))).limit(1);
          if (!membership) return 'business_line_forbidden';
        }
        const [row] = await transaction.insert(messagingChannels).values({ organizationId: input.organizationId, businessLineId: businessLine.id, provider: input.input.provider, displayName: input.input.displayName, phoneNumber: input.input.phoneNumber, providerChannelId: input.input.providerChannelId, providerAccountId: input.input.providerAccountId || null }).returning();
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.created', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, afterState: { businessLineId: businessLine.id, businessLineName: businessLine.name, provider: row.provider, displayName: row.displayName, phoneNumber: row.phoneNumber, providerChannelId: row.providerChannelId, providerAccountId: row.providerAccountId, isActive: row.isActive } });
        return this.toDto(row, 0, [], businessLine.name);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  async update(input: ChannelRepositoryUpdateDto): Promise<ChannelRecordDto | null | 'schedule_required' | 'profile_mismatch'> {
    return database.transaction(async (transaction) => {
      const locked = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!locked) return null;
      const before = locked.channel;
      const profileSelections = [
        { id: input.input.inboundAssistantProfileId, direction: 'inbound' },
        { id: input.input.outboundAssistantProfileId, direction: 'outbound' },
      ];
      for (const selection of profileSelections) {
        if (selection.id === undefined || selection.id === null) continue;
        if (!before.businessLineId) return 'profile_mismatch';
        const [profile] = await transaction.select({ id: assistantProfiles.id }).from(assistantProfiles)
          .where(and(eq(assistantProfiles.id, selection.id), eq(assistantProfiles.organizationId, input.organizationId), eq(assistantProfiles.businessLineId, before.businessLineId), eq(assistantProfiles.direction, selection.direction))).limit(1);
        if (!profile) return 'profile_mismatch';
      }
      const existingHours = await transaction.select({ dayOfWeek: channelBusinessHours.dayOfWeek, startTime: channelBusinessHours.startTime, endTime: channelBusinessHours.endTime }).from(channelBusinessHours)
        .where(and(eq(channelBusinessHours.organizationId, input.organizationId), eq(channelBusinessHours.channelId, input.channelId)));
      const effectiveMode = input.input.operationMode ?? before.operationMode;
      const effectiveScheduleMode = input.input.assistantScheduleMode ?? before.assistantScheduleMode;
      const effectiveHours = input.input.businessHours ?? existingHours;
      const needsSchedule = effectiveMode !== CHANNEL_OPERATION_MODE.outbound
        && effectiveScheduleMode !== CHANNEL_ASSISTANT_SCHEDULE_MODE.always
        && effectiveScheduleMode !== CHANNEL_ASSISTANT_SCHEDULE_MODE.disabled;
      if (needsSchedule && effectiveHours.length === 0) return 'schedule_required';
      const previousHours = input.input.businessHours === undefined ? null : existingHours;
      const { businessHours, ...channelChanges } = input.input;
      const [row] = await transaction.update(messagingChannels).set({ ...channelChanges, updatedAt: new Date() }).where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).returning();
      if (businessHours !== undefined) {
        await transaction.delete(channelBusinessHours).where(and(eq(channelBusinessHours.organizationId, input.organizationId), eq(channelBusinessHours.channelId, input.channelId)));
        if (businessHours.length) await transaction.insert(channelBusinessHours).values(businessHours.map((hours) => ({ ...hours, organizationId: input.organizationId, channelId: input.channelId })));
      }
      const savedHours = await transaction.select().from(channelBusinessHours).where(and(eq(channelBusinessHours.organizationId, input.organizationId), eq(channelBusinessHours.channelId, input.channelId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, beforeState: { displayName: before.displayName, isActive: before.isActive, dailyMessageLimit: before.dailyMessageLimit, dailyLimitTimeZone: before.dailyLimitTimeZone, operationMode: before.operationMode, assistantScheduleMode: before.assistantScheduleMode, inboundAssistantProfileId: before.inboundAssistantProfileId, outboundAssistantProfileId: before.outboundAssistantProfileId, ...(previousHours === null ? {} : { businessHours: previousHours }) }, afterState: { displayName: row.displayName, isActive: row.isActive, dailyMessageLimit: row.dailyMessageLimit, dailyLimitTimeZone: row.dailyLimitTimeZone, operationMode: row.operationMode, assistantScheduleMode: row.assistantScheduleMode, inboundAssistantProfileId: row.inboundAssistantProfileId, outboundAssistantProfileId: row.outboundAssistantProfileId, ...(previousHours === null ? {} : { businessHours: savedHours }) } });
      return this.toDto(row, 0, savedHours, locked.businessLineName);
    });
  }

  async softDelete(input: ChannelRepositoryDeleteDto): Promise<boolean | 'provider_mismatch'> {
    return database.transaction(async (transaction) => {
      const locked = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!locked) return false;
      if (locked.channel.provider !== CHANNEL_PROVIDER.evolution) return 'provider_mismatch';
      const deletedAt = new Date();
      await transaction.update(messagingChannels).set({ isActive: false, deletedAt, updatedAt: deletedAt })
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId), isNull(messagingChannels.deletedAt)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.deleted', entityType: 'messaging_channel', entityId: input.channelId, correlationId: input.correlationId, beforeState: { provider: locked.channel.provider, displayName: locked.channel.displayName, phoneNumber: locked.channel.phoneNumber, providerChannelId: locked.channel.providerChannelId, isActive: locked.channel.isActive }, afterState: { deletedAt: deletedAt.toISOString(), remoteInstanceDeleted: input.remoteInstanceDeleted } });
      return true;
    });
  }

  async saveCredentials(input: ChannelRepositoryCredentialsDto): Promise<ChannelRecordDto | 'not_found' | 'provider_mismatch'> {
    return database.transaction(async (transaction) => {
      const locked = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!locked) return 'not_found';
      const before = locked.channel;
      if (before.provider !== input.provider) return 'provider_mismatch';
      const [row] = await transaction.update(messagingChannels).set({ credentialsCiphertext: input.encrypted.ciphertext, credentialsIv: input.encrypted.iv, credentialsAuthTag: input.encrypted.authTag, connectionStatus: null, connectionUpdatedAt: null, updatedAt: new Date() })
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId))).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'channel.credentials_updated', entityType: 'messaging_channel', entityId: row.id, correlationId: input.correlationId, afterState: { provider: row.provider, credentialsConfigured: true } });
      return this.toDto(row);
    });
  }

  async healthCheckTarget(organizationId: string, channelId: string, userId: string, canManageAllLines: boolean): Promise<ChannelHealthCheckTargetDto | null> {
    const [row] = await database.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive,
      credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.id, channelId), eq(messagingChannels.organizationId, organizationId), isNull(messagingChannels.deletedAt), eq(businessLines.status, 'active'), channelMembershipCondition(organizationId, userId, canManageAllLines))).limit(1);
    if (!row) return null;
    const credentials = row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag
      ? { ciphertext: row.credentialsCiphertext, iv: row.credentialsIv, authTag: row.credentialsAuthTag }
      : null;
    return new ChannelHealthCheckTargetDto(row.id, channelProviderSchema.parse(row.provider), row.providerChannelId, row.isActive, credentials);
  }

  async evolutionMonitoringTargets(organizationId: string, channelIds: string[], userId: string, canManageAllLines: boolean): Promise<ChannelHealthCheckTargetDto[]> {
    if (channelIds.length === 0) return [];
    const rows = await database.select({ id: messagingChannels.id, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive,
      credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(messagingChannels).innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.organizationId, organizationId), isNull(messagingChannels.deletedAt), eq(messagingChannels.provider, CHANNEL_PROVIDER.evolution), inArray(messagingChannels.id, channelIds), eq(businessLines.status, 'active'), channelMembershipCondition(organizationId, userId, canManageAllLines)));
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
      const channel = await this.lockAccessibleChannel(transaction, input.organizationId, input.channelId, input.actorUserId, input.canManageAllLines);
      if (!channel) return false;
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user',
        action: 'channel.connection_checked', entityType: 'messaging_channel', entityId: channel.channel.id, correlationId: input.correlationId,
        afterState: { status: input.status, checkedAt: input.checkedAt.toISOString() } });
      return true;
    });
  }

  async auditEvolutionWebhookConfigured(organizationId: string, channelId: string, actorUserId: string, canManageAllLines: boolean, configuredAt: Date, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const channel = await this.lockAccessibleChannel(transaction, organizationId, channelId, actorUserId, canManageAllLines);
      if (!channel) return false;
      if (channel.channel.provider !== CHANNEL_PROVIDER.evolution) return false;
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: CHANNEL_AUDIT_ACTION.evolutionWebhookConfigured, entityType: 'messaging_channel', entityId: channel.channel.id, correlationId, afterState: { configuredAt: configuredAt.toISOString() } });
      return true;
    });
  }

  async auditEvolutionConnectionRequested(organizationId: string, channelId: string, actorUserId: string, canManageAllLines: boolean, status: string, requestedAt: Date, correlationId: string | null): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const channel = await this.lockAccessibleChannel(transaction, organizationId, channelId, actorUserId, canManageAllLines);
      if (!channel) return false;
      if (channel.channel.provider !== CHANNEL_PROVIDER.evolution) return false;
      await transaction.insert(auditEvents).values({ organizationId, actorUserId, actorType: 'user', action: CHANNEL_AUDIT_ACTION.evolutionConnectionRequested, entityType: 'messaging_channel', entityId: channel.channel.id, correlationId, afterState: { status, requestedAt: requestedAt.toISOString() } });
      return true;
    });
  }

  async setEvolutionConnectionStatus(input: ChannelConnectionStatusUpdateDto): Promise<boolean> {
    return database.transaction(async (transaction) => {
      const [channel] = await transaction.select({ id: messagingChannels.id, connectionStatus: messagingChannels.connectionStatus, businessLineId: messagingChannels.businessLineId }).from(messagingChannels)
        .where(and(eq(messagingChannels.id, input.channelId), eq(messagingChannels.organizationId, input.organizationId), eq(messagingChannels.provider, CHANNEL_PROVIDER.evolution))).for('update').limit(1);
      if (!channel) return false;
      await transaction.update(messagingChannels).set({ connectionStatus: input.status, connectionUpdatedAt: input.updatedAt, updatedAt: input.updatedAt })
        .where(and(eq(messagingChannels.id, channel.id), eq(messagingChannels.organizationId, input.organizationId)));
      if (input.status === CHANNEL_CONNECTION_STATUS.disconnected && channel.connectionStatus !== CHANNEL_CONNECTION_STATUS.disconnected) {
        const members = await transaction.select({ userId: authMember.userId, role: authMember.role, businessLineId: businessLineMembers.businessLineId, lineStatus: businessLines.status }).from(authMember)
          .leftJoin(businessLineMembers, and(eq(businessLineMembers.memberId, authMember.id), eq(businessLineMembers.organizationId, authMember.organizationId), channel.businessLineId ? eq(businessLineMembers.businessLineId, channel.businessLineId) : sql`false`))
          .leftJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId), eq(businessLines.status, 'active')))
          .where(eq(authMember.organizationId, input.organizationId));
        const recipients = members.filter(({ role, businessLineId, lineStatus }) => hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES)
          || (Boolean(channel.businessLineId) && businessLineId === channel.businessLineId && lineStatus === 'active'));
        if (recipients.length) await transaction.insert(userNotifications).values(recipients.map((recipient) => ({
          organizationId: input.organizationId,
          recipientUserId: recipient.userId,
          channelId: channel.id,
          notificationType: USER_NOTIFICATION_TYPE.channelDisconnected,
          idempotencyKey: `channel-disconnected:${channel.id}:${input.updatedAt.toISOString()}`,
        }))).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
      }
      return true;
    });
  }

  async listWebhookEvents(organizationId: string, channelId: string, userId: string, canManageAllLines: boolean, query: ChannelWebhookEventsQueryDto): Promise<ChannelWebhookEventsPageDto> {
    const channelScope = and(sql`${inboxEvents.payloadRedacted}->>'channelId' = ${channelId}`, exists(database.select({ id: messagingChannels.id }).from(messagingChannels)
      .innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.id, channelId), eq(businessLines.status, 'active'), channelMembershipCondition(organizationId, userId, canManageAllLines)))));
    const where = and(eq(inboxEvents.organizationId, organizationId), channelScope);
    const [rows, [count]] = await Promise.all([
      database.select({ id: inboxEvents.id, provider: inboxEvents.provider, eventType: inboxEvents.eventType, eventFamily: sql<string>`${inboxEvents.payloadRedacted}->>'eventFamily'`, status: inboxEvents.status, attempts: inboxEvents.attempts, receivedAt: inboxEvents.receivedAt, processedAt: inboxEvents.processedAt, lastErrorCode: inboxEvents.lastErrorCode })
        .from(inboxEvents).where(where).orderBy(desc(inboxEvents.receivedAt), desc(inboxEvents.id)).limit(query.limit).offset(query.offset),
      database.select({ total: sql<number>`count(*)::int` }).from(inboxEvents).where(where),
    ]);
    const data = rows.map((row) => new ChannelWebhookEventRecordDto(row.id, row.provider, row.eventType, row.eventFamily ?? 'other', row.status, Number(row.attempts), row.receivedAt.toISOString(), row.processedAt?.toISOString() ?? null, this.toSafeErrorCode(row.lastErrorCode)));
    return new ChannelWebhookEventsPageDto(data, { limit: query.limit, offset: query.offset, total: count.total, hasNextPage: query.offset + data.length < count.total });
  }

  private toDto(row: typeof messagingChannels.$inferSelect, dailyMessageCount = 0, businessHours: ChannelRecordDto['businessHours'] = [], businessLineName: string | null = null, scheduleExceptions: ChannelRecordDto['scheduleExceptions'] = []): ChannelRecordDto {
    return new ChannelRecordDto(row.id, channelProviderSchema.parse(row.provider), row.displayName, row.phoneNumber, row.providerChannelId, row.providerAccountId, row.isActive, row.dailyMessageLimit, row.dailyLimitTimeZone, dailyMessageCount, row.createdAt.toISOString(), row.updatedAt.toISOString(), Boolean(row.credentialsCiphertext && row.credentialsIv && row.credentialsAuthTag), row.connectionStatus === null ? null : channelConnectionStatusSchema.parse(row.connectionStatus), row.connectionUpdatedAt?.toISOString() ?? null, channelOperationModeSchema.parse(row.operationMode), channelAssistantScheduleModeSchema.parse(row.assistantScheduleMode), businessHours.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })), row.businessLineId, businessLineName, scheduleExceptions, row.inboundAssistantProfileId, row.outboundAssistantProfileId);
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private toSafeErrorCode(errorCode: string | null): string | null {
    if (!errorCode) return null;
    return /^[A-Z0-9_.-]{1,80}$/i.test(errorCode) ? errorCode : CHANNEL_EVENT_ERROR_FALLBACK;
  }
}
