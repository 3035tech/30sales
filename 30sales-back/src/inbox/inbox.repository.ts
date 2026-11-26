import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, notExists, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accountPeople, accounts, agentSettings, auditEvents, businessLineMembers, businessLines, conversationGroupParticipants, conversationReads, conversationTagLinks, conversationTags, conversations, leadContacts, leads, leadStatusHistory, messageAttachments, messageHiddenForUsers, messages, messagingChannels, opportunityConversationContexts, opportunities, opportunityStageHistory, people, tasks, userNotifications } from '../db/schema';
import { member as authMember, user as authUser } from '../db/auth-schema';
import { channelAssistantScheduleModeSchema, channelOperationModeSchema, channelProviderSchema, ChannelRecordDto } from '../channels/channels.dto';
import { MessageAttachmentDto } from '../attachments/attachments.dto';
import { ConversationAssignDto, ConversationAssigneeDto, ConversationAutomationUpdateDto, ConversationContactReconcileDto, ConversationContactReconcileResultDto, ConversationControlDto, ConversationControlResultDto, ConversationLeadSummaryDto, ConversationListItemDto, ConversationMessageDeliveryDto, ConversationMessageSendDto, ConversationMessagesQueryDto, ConversationNoteCreateDto, ConversationPageDto, ConversationReadDto, ConversationReadResultDto, ConversationRepositoryListDto, ConversationStatusUpdateDto, ConversationTagDto, ConversationTagMutationDto, ConversationTagRemoveDto, ConversationOpportunityCreateDto, conversationAutomationModeSchema, conversationStatusUpdateSchema, MessageRecordDto, AssistantQualificationDto, type OutboundMediaInputDto } from './inbox.dto';
import { hasOrganizationRole, ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { OUTBOUND_MEDIA_ATTACHMENT_STATUS, OUTBOUND_MEDIA_ERROR } from './outbound-media.constants';
import { CHANNEL_CONNECTION_ERROR, CHANNEL_MESSAGE_QUOTA_ERROR, CHANNEL_PROVIDER, CHANNEL_QUOTA_COUNTED_DIRECTION, CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE, CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES } from '../channels/channels.constants';
import { INBOX_ACTIVE_CONVERSATION_STATUSES, INBOX_CONTACT_RECONCILIATION_AUDIT_ACTION, INBOX_CONTACT_RECONCILIATION_RESULT } from './inbox.constants';
import { USER_NOTIFICATION_TYPE } from '../notifications/notifications.constants';
import { BUSINESS_LINE_STATUS } from '../business-lines/business-lines.constants';
import { applyPendingEvolutionMessageStatuses } from '../webhooks/pending-message-statuses';

const conversationAssigneeRoleValues = sql.join(ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES.map((role) => sql`${role}`), sql`, `);
type InboxTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0];

type PreparedMessageSend = { kind: 'prepared'; message: MessageRecordDto; channelId: string; recipientPhone: string; provider: 'evolution' | 'whatsapp_cloud_api'; providerChannelId: string; targetMessage: { externalMessageId: string; remoteJid: string | null; fromMe: boolean; participant: string | null; bodyText: string | null } | null; credentials: { ciphertext: string; iv: string; authTag: string } };
type MessageSendResult = PreparedMessageSend | { kind: 'duplicate'; message: MessageRecordDto } | 'not_found' | 'not_owner' | 'automation_not_human' | 'channel_unavailable' | 'credentials_missing' | 'recipient_missing' | 'target_message_unavailable' | typeof CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached | typeof CHANNEL_CONNECTION_ERROR.unavailable;

@Injectable()
export class InboxRepository {
  async getGroupParticipantsTarget(organizationId: string, conversationId: string, userId: string, isPlatformOrganizationContext = false) {
    const canRead = isPlatformOrganizationContext
      ? Boolean((await database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1))[0])
      : await this.canAccessConversationLine(organizationId, conversationId, userId);
    if (!canRead) return null;
    const [target] = await database.select({ provider: conversations.provider, conversationType: conversations.conversationType, groupJid: conversations.providerRecipientId,
      channelId: messagingChannels.id, providerChannelId: messagingChannels.providerChannelId, credentialsCiphertext: messagingChannels.credentialsCiphertext,
      credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag })
      .from(conversations).innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    return target?.conversationType === 'group' && target.groupJid && target.credentialsCiphertext && target.credentialsIv && target.credentialsAuthTag ? target : null;
  }

  async getTypingPresenceTarget(organizationId: string, conversationId: string, userId: string, isPlatformOrganizationContext = false) {
    if (!isPlatformOrganizationContext && !await this.canAccessConversationLine(organizationId, conversationId, userId)) return null;
    const [target] = await database.select({
      ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode, status: conversations.status,
      conversationType: conversations.conversationType, groupJid: conversations.providerRecipientId,
      channelId: conversations.channelId, provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId,
      channelActive: messagingChannels.isActive, connectionStatus: messagingChannels.connectionStatus,
      recipientPhone: people.phone, credentialsCiphertext: messagingChannels.credentialsCiphertext,
      credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag,
    }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    if (!target || target.ownerUserId !== userId || target.automationMode !== 'human' || !INBOX_ACTIVE_CONVERSATION_STATUSES.some((status) => status === target.status) || !target.channelId || !target.channelActive || !target.providerChannelId || !target.credentialsCiphertext || !target.credentialsIv || !target.credentialsAuthTag) return null;
    const recipient = target.conversationType === 'group' ? target.groupJid ?? '' : (target.recipientPhone ?? '').replace(/\D/g, '');
    if (target.conversationType === 'group' ? !recipient.endsWith('@g.us') : recipient.length < 8 || recipient.length > 15 || recipient.startsWith('0')) return null;
    return { channelId: target.channelId, provider: target.provider, providerChannelId: target.providerChannelId, recipientPhone: recipient, credentials: { ciphertext: target.credentialsCiphertext, iv: target.credentialsIv, authTag: target.credentialsAuthTag } };
  }

  async syncGroupParticipantsSnapshot(input: { organizationId: string; conversationId: string; provider: string; participants: Array<{ id: string; phone: string | null; name: string | null; isAdmin: boolean }> }) {
    await database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId), eq(conversations.conversationType, 'group'), eq(conversations.provider, input.provider))).for('update').limit(1);
      if (!conversation) return;
      await transaction.update(conversationGroupParticipants).set({ isPresent: false, updatedAt: new Date() })
        .where(and(eq(conversationGroupParticipants.organizationId, input.organizationId), eq(conversationGroupParticipants.conversationId, input.conversationId), eq(conversationGroupParticipants.provider, input.provider)));
      for (const participant of input.participants.slice(0, 1000)) {
        if (!participant.id || participant.id.length > 250) continue;
        await transaction.insert(conversationGroupParticipants).values({
          organizationId: input.organizationId, conversationId: input.conversationId, provider: input.provider,
          externalParticipantId: participant.id, phone: participant.phone, displayName: participant.name,
          isAdmin: participant.isAdmin, isPresent: true, updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [conversationGroupParticipants.organizationId, conversationGroupParticipants.conversationId, conversationGroupParticipants.provider, conversationGroupParticipants.externalParticipantId],
          set: { phone: participant.phone, displayName: participant.name, isAdmin: participant.isAdmin, isPresent: true, updatedAt: new Date() },
        });
      }
    });
    return this.listStoredGroupParticipants(input.organizationId, input.conversationId, input.provider);
  }

  listStoredGroupParticipants(organizationId: string, conversationId: string, provider: string) {
    return database.select({ id: conversationGroupParticipants.externalParticipantId, phone: conversationGroupParticipants.phone, name: conversationGroupParticipants.displayName, isAdmin: conversationGroupParticipants.isAdmin })
      .from(conversationGroupParticipants)
      .where(and(eq(conversationGroupParticipants.organizationId, organizationId), eq(conversationGroupParticipants.conversationId, conversationId), eq(conversationGroupParticipants.provider, provider), eq(conversationGroupParticipants.isPresent, true)))
      .orderBy(asc(conversationGroupParticipants.displayName), asc(conversationGroupParticipants.externalParticipantId));
  }

  async canAccessConversationLine(organizationId: string, conversationId: string, userId: string): Promise<boolean> {
    const [membership] = await database.select({ role: authMember.role }).from(authMember)
      .where(and(eq(authMember.organizationId, organizationId), eq(authMember.userId, userId))).limit(1);
    if (!membership) return false;
    if (hasOrganizationRole(membership.role, ORGANIZATION_MANAGEMENT_ROLES)) {
      const [conversation] = await database.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
      return Boolean(conversation);
    }
    const [lineAccess] = await database.select({ id: conversations.id }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .innerJoin(businessLineMembers, and(eq(businessLineMembers.businessLineId, businessLines.id), eq(businessLineMembers.organizationId, businessLines.organizationId)))
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId), eq(authMember.userId, userId), eq(businessLines.status, BUSINESS_LINE_STATUS.active))).limit(1);
    return Boolean(lineAccess);
  }

  private async canAccessConversationLineInTransaction(transaction: InboxTransaction, organizationId: string, conversationId: string, userId: string, isPlatformOrganizationContext = false): Promise<boolean> {
    if (isPlatformOrganizationContext) {
      const [conversation] = await transaction.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
      return Boolean(conversation);
    }
    const [actor] = await transaction.select({ id: authMember.id, role: authMember.role }).from(authMember)
      .where(and(eq(authMember.organizationId, organizationId), eq(authMember.userId, userId))).for('share').limit(1);
    if (!actor) return false;
    if (hasOrganizationRole(actor.role, ORGANIZATION_MANAGEMENT_ROLES)) return true;

    const [channel] = await transaction.select({ businessLineId: messagingChannels.businessLineId }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    if (!channel?.businessLineId) return false;
    const [line] = await transaction.select({ id: businessLines.id, status: businessLines.status }).from(businessLines)
      .where(and(eq(businessLines.id, channel.businessLineId), eq(businessLines.organizationId, organizationId))).for('share').limit(1);
    if (!line || line.status !== BUSINESS_LINE_STATUS.active) return false;
    const [lineMembership] = await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, line.id), eq(businessLineMembers.memberId, actor.id))).for('share').limit(1);
    return Boolean(lineMembership);
  }

  private async canAssignToLineInTransaction(transaction: InboxTransaction, organizationId: string, conversationId: string, assigneeUserId: string): Promise<boolean> {
    const [assignee] = await transaction.select({ id: authMember.id }).from(authMember)
      .where(and(eq(authMember.organizationId, organizationId), eq(authMember.userId, assigneeUserId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY[${conversationAssigneeRoleValues}]::text[]`)).for('share').limit(1);
    if (!assignee) return false;
    const [channel] = await transaction.select({ businessLineId: messagingChannels.businessLineId }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    if (!channel?.businessLineId) return false;
    const [line] = await transaction.select({ id: businessLines.id, status: businessLines.status }).from(businessLines)
      .where(and(eq(businessLines.id, channel.businessLineId), eq(businessLines.organizationId, organizationId))).for('share').limit(1);
    if (!line || line.status !== BUSINESS_LINE_STATUS.active) return false;
    const [lineMembership] = await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(businessLineMembers.businessLineId, line.id), eq(businessLineMembers.memberId, assignee.id))).for('share').limit(1);
    return Boolean(lineMembership);
  }

  async reconcileContact(input: ConversationContactReconcileDto): Promise<ConversationContactReconcileResultDto | 'not_found' | 'missing_contact' | 'invalid_phone' | 'not_owner' | 'contact_shared_across_lines'> {
    const phone = input.phone?.trim();
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (phone && (!/^\+[1-9][0-9\s().-]*$/.test(phone) || digits.length < 8 || digits.length > 15)) return INBOX_CONTACT_RECONCILIATION_RESULT.invalidPhone;
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, personId: conversations.personId, ownerUserId: conversations.ownerUserId, businessLineId: messagingChannels.businessLineId, lineStatus: businessLines.status }).from(conversations)
        .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
        .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return INBOX_CONTACT_RECONCILIATION_RESULT.notFound;
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return INBOX_CONTACT_RECONCILIATION_RESULT.notFound;
      if (conversation.ownerUserId !== input.actorUserId) return INBOX_CONTACT_RECONCILIATION_RESULT.notOwner;
      const [actor] = await transaction.select({ id: authMember.id, role: authMember.role }).from(authMember)
        .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.actorUserId))).limit(1);
      if (!actor || !conversation.businessLineId || conversation.lineStatus !== 'active') return INBOX_CONTACT_RECONCILIATION_RESULT.notFound;
      if (!hasOrganizationRole(actor.role, ORGANIZATION_MANAGEMENT_ROLES)) {
        const [lineMembership] = await transaction.select({ id: businessLineMembers.memberId }).from(businessLineMembers)
          .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
          .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, conversation.businessLineId), eq(businessLineMembers.memberId, actor.id), eq(businessLines.status, 'active'))).limit(1);
        if (!lineMembership) return INBOX_CONTACT_RECONCILIATION_RESULT.notFound;
      }
      if (!conversation.personId) return INBOX_CONTACT_RECONCILIATION_RESULT.missingContact;
      const [lead] = await transaction.select({ id: leads.id, accountId: leads.accountId, businessLineId: leads.businessLineId }).from(leads)
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).for('update').limit(1);
      if (!lead || lead.businessLineId !== conversation.businessLineId) return INBOX_CONTACT_RECONCILIATION_RESULT.notFound;
      const [person] = await transaction.select({ id: people.id, name: people.name, phone: people.phone }).from(people)
        .where(and(eq(people.id, conversation.personId), eq(people.organizationId, input.organizationId))).limit(1);
      if (!person) return INBOX_CONTACT_RECONCILIATION_RESULT.missingContact;
      const updatedName = input.name ?? person.name;
      const updatedPhone = phone ? digits : person.phone;
      if (updatedName !== person.name || updatedPhone !== person.phone) {
        const otherLineLead = exists(transaction.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.organizationId, input.organizationId), eq(leads.personId, person.id), sql`${leads.businessLineId} <> ${conversation.businessLineId}`)));
        const otherLineContact = exists(transaction.select({ id: leadContacts.id }).from(leadContacts)
          .innerJoin(leads, and(eq(leads.id, leadContacts.leadId), eq(leads.organizationId, leadContacts.organizationId)))
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.personId, person.id), sql`${leads.businessLineId} <> ${conversation.businessLineId}`)));
        const otherLineConversation = exists(transaction.select({ id: conversations.id }).from(conversations)
          .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
          .where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.personId, person.id), sql`${messagingChannels.businessLineId} <> ${conversation.businessLineId}`)));
        const [sharing] = await transaction.select({ isShared: sql<boolean>`${otherLineLead} or ${otherLineContact} or ${otherLineConversation}` })
          .from(people).where(and(eq(people.id, person.id), eq(people.organizationId, input.organizationId))).limit(1);
        if (sharing?.isShared) return INBOX_CONTACT_RECONCILIATION_RESULT.contactSharedAcrossLines;
      }
      await transaction.update(people).set({ name: updatedName, phone: updatedPhone, updatedAt: new Date() })
        .where(and(eq(people.id, person.id), eq(people.organizationId, input.organizationId)));
      await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: lead.id, personId: person.id, createdByUserId: input.actorUserId })
        .onConflictDoNothing({ target: [leadContacts.leadId, leadContacts.personId] });
      if (input.isPrimary) {
        await transaction.update(leadContacts).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, lead.id), eq(leadContacts.isPrimary, true)));
        await transaction.update(leadContacts).set({ isPrimary: true, updatedAt: new Date() }).where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, lead.id), eq(leadContacts.personId, person.id)));
        await transaction.update(leads).set({ personId: person.id, updatedAt: new Date() }).where(and(eq(leads.organizationId, input.organizationId), eq(leads.id, lead.id)));
      }
      if (input.isInterested) await transaction.update(leadContacts).set({ isInterested: true, updatedAt: new Date() }).where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, lead.id), eq(leadContacts.personId, person.id)));
      await transaction.update(conversations).set({ accountId: lead.accountId, updatedAt: new Date() })
        .where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, input.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: INBOX_CONTACT_RECONCILIATION_AUDIT_ACTION, entityType: 'conversation', entityId: conversation.id, correlationId: input.correlationId, beforeState: { personId: person.id, hasPhone: Boolean(person.phone) }, afterState: { leadId: lead.id, personId: person.id, hasPhone: Boolean(updatedPhone), isPrimary: input.isPrimary, isInterested: input.isInterested } });
      const [account] = await transaction.select({ name: accounts.name }).from(accounts).where(and(eq(accounts.id, lead.accountId), eq(accounts.organizationId, input.organizationId))).limit(1);
      return new ConversationContactReconcileResultDto(conversation.id, lead.id, account?.name ?? '', updatedName, updatedPhone);
    });
  }
  async createOpportunityFromConversation(input: ConversationOpportunityCreateDto): Promise<{ opportunityId: string | null; taskId: string; leadId: string; leadCreated: boolean; created: boolean } | 'not_found' | 'not_owner' | 'lead_unavailable' | 'lead_selection_required' | 'conversation_linked_elsewhere'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, accountId: conversations.accountId, personId: conversations.personId, opportunityId: conversations.opportunityId, ownerUserId: conversations.ownerUserId, businessLineId: messagingChannels.businessLineId, lineStatus: businessLines.status, personName: people.name, personPhone: people.phone })
        .from(conversations).innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
        .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
        .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation || !await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      if (!conversation.businessLineId || conversation.lineStatus !== 'active' || !conversation.personId) return 'not_found';
      const [previousRequest] = await transaction.select({ entityId: auditEvents.entityId, afterState: auditEvents.afterState }).from(auditEvents)
        .where(and(eq(auditEvents.organizationId, input.organizationId), eq(auditEvents.actorUserId, input.actorUserId), eq(auditEvents.action, 'task.created'), eq(auditEvents.entityType, 'task'), sql`${auditEvents.afterState}->>'requestKey' = ${input.input.requestKey}`, sql`${auditEvents.afterState}->>'conversationId' = ${conversation.id}`)).limit(1);
      if (previousRequest) {
        const state = previousRequest.afterState as Record<string, unknown>;
        if (typeof previousRequest.entityId === 'string' && typeof state.leadId === 'string') return { taskId: previousRequest.entityId, leadId: state.leadId, opportunityId: typeof state.opportunityId === 'string' ? state.opportunityId : null, leadCreated: state.leadCreated === true, created: state.created === true };
      }
      let lead: { id: string; accountId: string; personId: string | null; businessLineId: string | null; accountName: string; contactName: string | null } | undefined;
      let leadCreated = false;
      if (input.input.leadId) {
        [lead] = await transaction.select({ id: leads.id, accountId: leads.accountId, personId: leads.personId, businessLineId: leads.businessLineId, accountName: accounts.name, contactName: people.name })
          .from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
          .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
          .where(and(eq(leads.id, input.input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, conversation.businessLineId))).for('update', { of: leads }).limit(1);
        if (!lead) return 'lead_unavailable';
      } else if (conversation.personId) {
        const contactLink = exists(transaction.select({ id: leadContacts.id }).from(leadContacts).where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leads.id), eq(leadContacts.personId, conversation.personId))));
        const matchingLeads = await transaction.select({ id: leads.id, accountId: leads.accountId, personId: leads.personId, businessLineId: leads.businessLineId, accountName: accounts.name, contactName: people.name })
          .from(leads).innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
          .leftJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
          .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, conversation.businessLineId), or(eq(leads.personId, conversation.personId), contactLink))).for('update', { of: leads }).limit(2);
        if (matchingLeads.length > 1) return 'lead_selection_required';
        lead = matchingLeads[0];
      }
      if (!lead && conversation.personId) {
        const companyName = input.input.companyName?.trim() || `Empresa a identificar · ${conversation.personName?.trim() || conversation.personPhone || conversation.id.slice(0, 8)}`;
        const [linkedAccount] = conversation.accountId ? await transaction.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(eq(accounts.id, conversation.accountId), eq(accounts.organizationId, input.organizationId))).limit(1) : [];
        let account = linkedAccount;
        if (!account) [account] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: companyName }).returning({ id: accounts.id, name: accounts.name });
        if (!account) return 'lead_unavailable';
        const [newLead] = await transaction.insert(leads).values({ organizationId: input.organizationId, businessLineId: conversation.businessLineId, accountId: account.id, personId: conversation.personId, createdByUserId: input.actorUserId, assignedToUserId: input.actorUserId, source: 'whatsapp', status: 'new', nextActionAt: new Date(input.input.nextActionAt) }).returning({ id: leads.id });
        await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: newLead.id, personId: conversation.personId, isPrimary: true, createdByUserId: input.actorUserId });
        await transaction.insert(accountPeople).values({ organizationId: input.organizationId, accountId: account.id, personId: conversation.personId, createdByUserId: input.actorUserId }).onConflictDoNothing();
        await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: newLead.id, fromStatus: null, toStatus: 'new', changedByUserId: input.actorUserId });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'lead.created', entityType: 'lead', entityId: newLead.id, correlationId: input.correlationId, afterState: { status: 'new', source: 'whatsapp', createdFromConversation: conversation.id, companyIdentified: Boolean(input.input.companyName?.trim()) } });
        lead = { id: newLead.id, accountId: account.id, personId: conversation.personId, businessLineId: conversation.businessLineId, accountName: account.name, contactName: conversation.personName };
        leadCreated = true;
      }
      if (!lead) return 'lead_unavailable';
      if (!lead.personId) {
        await transaction.update(leads).set({ personId: conversation.personId, updatedAt: new Date() }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, input.organizationId)));
        await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: lead.id, personId: conversation.personId, isPrimary: true, createdByUserId: input.actorUserId }).onConflictDoNothing();
        lead.personId = conversation.personId;
      }
      await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: lead.id, personId: conversation.personId, isPrimary: false, createdByUserId: input.actorUserId }).onConflictDoNothing();
      await transaction.insert(accountPeople).values({ organizationId: input.organizationId, accountId: lead.accountId, personId: conversation.personId, createdByUserId: input.actorUserId }).onConflictDoNothing();
      if (conversation.opportunityId) {
        const [linked] = await transaction.select({ leadId: opportunities.leadId }).from(opportunities).where(and(eq(opportunities.id, conversation.opportunityId), eq(opportunities.organizationId, input.organizationId))).limit(1);
        if (!linked || linked.leadId !== lead.id) return 'conversation_linked_elsewhere';
      }
      const now = new Date();
      const dueAt = new Date(input.input.nextActionAt);
      const [task] = await transaction.insert(tasks).values({ organizationId: input.organizationId, leadId: lead.id, createdByUserId: input.actorUserId, assignedToUserId: input.actorUserId, title: input.input.nextAction, dueAt }).returning({ id: tasks.id });
      const [existing] = input.input.createOpportunity ? await transaction.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.organizationId, input.organizationId), eq(opportunities.leadId, lead.id))).for('update').limit(1) : [];
      let opportunityId = conversation.opportunityId ?? existing?.id;
      const created = input.input.createOpportunity && !opportunityId;
      if (input.input.createOpportunity && !opportunityId) {
        const [opportunity] = await transaction.insert(opportunities).values({ organizationId: input.organizationId, leadId: lead.id, accountId: lead.accountId, primaryPersonId: conversation.personId, name: `${lead.accountName} — ${input.input.summary.slice(0, 120)}`, stage: 'qualification', nextAction: input.input.nextAction, nextActionAt: new Date(input.input.nextActionAt), createdByUserId: input.actorUserId }).returning({ id: opportunities.id });
        opportunityId = opportunity.id;
        await transaction.insert(opportunityStageHistory).values({ organizationId: input.organizationId, opportunityId, fromStage: null, fromPipelineStageKey: null, toStage: 'qualification', toPipelineStageKey: null, actorUserId: input.actorUserId, reason: 'Opportunity created from an Inbox conversation.' });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'opportunity.created', entityType: 'opportunity', entityId: opportunityId, correlationId: input.correlationId, afterState: { stage: 'qualification', source: 'inbox_conversation', conversationId: conversation.id, leadId: lead.id } });
      }
      await transaction.update(leads).set({ nextActionAt: dueAt, updatedAt: now }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, input.organizationId)));
      if (opportunityId) await transaction.update(opportunities).set({ nextAction: input.input.nextAction, nextActionAt: dueAt, updatedAt: now }).where(and(eq(opportunities.id, opportunityId), eq(opportunities.organizationId, input.organizationId)));
      await transaction.update(conversations).set({ accountId: lead.accountId, opportunityId: input.input.createOpportunity ? opportunityId : conversation.opportunityId, updatedAt: now }).where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, input.organizationId)));
      if (opportunityId && input.input.createOpportunity) {
        await transaction.insert(opportunityConversationContexts).values({ organizationId: input.organizationId, opportunityId, conversationId: conversation.id, summary: input.input.summary, confirmedFacts: input.input.confirmedFacts, unknowns: input.input.unknowns, capturedAt: now })
          .onConflictDoUpdate({ target: [opportunityConversationContexts.organizationId, opportunityConversationContexts.conversationId], set: { opportunityId, summary: input.input.summary, confirmedFacts: input.input.confirmedFacts, unknowns: input.input.unknowns, capturedAt: now } });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'opportunity.conversation_context_added', entityType: 'opportunity', entityId: opportunityId, correlationId: input.correlationId, afterState: { conversationId: conversation.id, leadId: lead.id, summaryLength: input.input.summary.length, created } });
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'task.created', entityType: 'task', entityId: task.id, correlationId: input.correlationId, afterState: { leadId: lead.id, opportunityId: opportunityId ?? null, conversationId: conversation.id, source: 'inbox_follow_up', requestKey: input.input.requestKey, leadCreated, created } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: conversation.id, occurredAt: now.toISOString() })})`);
      return { opportunityId: input.input.createOpportunity ? opportunityId ?? null : null, taskId: task.id, leadId: lead.id, leadCreated, created };
    });
  }
  async isAssistantEnabled(organizationId: string, conversationId: string): Promise<boolean> {
    const [channel] = await database.select({ businessLineId: messagingChannels.businessLineId, lineStatus: businessLines.status }).from(conversations)
      .innerJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId))).limit(1);
    if (!channel || (channel.businessLineId && channel.lineStatus !== 'active')) return false;
    const [lineSettings] = channel.businessLineId ? await database.select({ enabled: agentSettings.enabled }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, organizationId), eq(agentSettings.businessLineId, channel.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1) : [];
    if (lineSettings) return lineSettings.enabled;
    const [settings] = await database.select({ enabled: agentSettings.enabled }).from(agentSettings)
      .where(and(eq(agentSettings.organizationId, organizationId), isNull(agentSettings.businessLineId), eq(agentSettings.agentKey, 'assistant'))).limit(1);
    return settings?.enabled ?? false;
  }

  async listAssignees(organizationId: string): Promise<ConversationAssigneeDto[]> {
    const rows = await database.select({ id: authUser.id, name: authUser.name, role: authMember.role }).from(authMember)
      .innerJoin(authUser, eq(authUser.id, authMember.userId)).where(and(eq(authMember.organizationId, organizationId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY[${conversationAssigneeRoleValues}]::text[]`)).orderBy(asc(authUser.name));
    return rows.map((row) => new ConversationAssigneeDto(row.id, row.name, row.role));
  }

  async list(input: ConversationRepositoryListDto): Promise<ConversationPageDto> {
    const conditions = [eq(conversations.organizationId, input.organizationId)];
    const accessibleBusinessLineIds = input.canManageAll ? null : await this.accessibleBusinessLineIds(input.organizationId, input.userId);
    const firstUnreadMessageId = sql<string | null>`(select unread_message.id from messages unread_message left join conversation_reads conversation_read on conversation_read.organization_id = unread_message.organization_id and conversation_read.conversation_id = unread_message.conversation_id and conversation_read.user_id = ${input.userId} where unread_message.organization_id = ${input.organizationId} and unread_message.conversation_id = ${conversations.id} and unread_message.direction = 'inbound' and ((conversation_read.last_read_message_id is not null and (unread_message.created_at > conversation_read.last_read_at or (unread_message.created_at = conversation_read.last_read_at and unread_message.id > conversation_read.last_read_message_id))) or (conversation_read.last_read_message_id is null and unread_message.created_at > coalesce(conversation_read.last_read_at, 'epoch'::timestamptz))) order by unread_message.created_at asc, unread_message.id asc limit 1)`;
    const unreadExists = sql<boolean>`${firstUnreadMessageId} is not null`;
    if (input.query.businessLineId) conditions.push(eq(messagingChannels.businessLineId, input.query.businessLineId));
    if (accessibleBusinessLineIds) conditions.push(inArray(messagingChannels.businessLineId, accessibleBusinessLineIds));
    if (input.query.status) conditions.push(eq(conversations.status, input.query.status));
    if (input.query.conversationId) conditions.push(eq(conversations.id, input.query.conversationId));
    if (input.query.channelId) conditions.push(eq(conversations.channelId, input.query.channelId));
    if (input.canManageAll && input.query.ownerUserId === 'unassigned') conditions.push(sql`${conversations.ownerUserId} is null`);
    else if (input.canManageAll && input.query.ownerUserId) conditions.push(eq(conversations.ownerUserId, input.query.ownerUserId));
    if (input.query.search) {
      const pattern = `%${input.query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(accounts.name, pattern), ilike(people.name, pattern), ilike(people.phone, pattern))!);
    }
    if (input.query.unreadOnly) conditions.push(unreadExists);
    if (input.query.tagId) conditions.push(sql`exists (select 1 from conversation_tag_links ctl where ctl.organization_id = ${input.organizationId} and ctl.conversation_id = ${conversations.id} and ctl.tag_id = ${input.query.tagId})`);
    const [{ total }] = await database.select({ total: count() }).from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .where(and(...conditions));
    const rows = await database.select({ id: conversations.id, accountId: conversations.accountId, personId: conversations.personId, provider: conversations.provider, conversationType: conversations.conversationType, displayName: conversations.displayName, status: conversations.status, providerArchived: conversations.providerArchived, providerPinned: conversations.providerPinned, providerUnreadCount: conversations.providerUnreadCount, providerDeleted: conversations.providerDeleted, accountName: accounts.name, personName: people.name, personEmail: people.email, personPhone: people.phone, lastMessageAt: conversations.lastMessageAt, createdAt: conversations.createdAt, channelId: conversations.channelId, channelName: messagingChannels.displayName, channelPhoneNumber: messagingChannels.phoneNumber, channelProvider: messagingChannels.provider, businessLineId: messagingChannels.businessLineId, businessLineName: businessLines.name, businessLineStatus: businessLines.status, channelActive: messagingChannels.isActive, channelConfigured: messagingChannels.credentialsCiphertext, ownerUserId: conversations.ownerUserId, ownerName: authUser.name, automationMode: conversations.automationMode, qualificationIntent: conversations.assistantQualificationIntent, qualificationSummary: conversations.assistantQualificationSummary, confirmedFacts: conversations.assistantConfirmedFacts, unknowns: conversations.assistantUnknowns, nextStep: conversations.assistantNextStep, qualificationUpdatedAt: conversations.assistantQualificationUpdatedAt, unread: unreadExists, firstUnreadMessageId })
      .from(conversations)
      .leftJoin(accounts, and(eq(accounts.id, conversations.accountId), eq(accounts.organizationId, conversations.organizationId)))
      .leftJoin(people, and(eq(people.id, conversations.personId), eq(people.organizationId, conversations.organizationId)))
      .leftJoin(messagingChannels, and(eq(messagingChannels.id, conversations.channelId), eq(messagingChannels.organizationId, conversations.organizationId)))
      .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .leftJoin(authMember, and(eq(authMember.organizationId, conversations.organizationId), eq(authMember.userId, conversations.ownerUserId)))
      .leftJoin(authUser, eq(authUser.id, authMember.userId))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`), desc(conversations.id))
      .limit(input.query.limit).offset(input.query.offset);
    const latestMessages = rows.length ? await database.selectDistinctOn([messages.conversationId], { id: messages.id, conversationId: messages.conversationId, bodyText: sql<string | null>`left(${messages.bodyText}, 180)`, direction: messages.direction, deliveryState: messages.deliveryState, providerMetadata: messages.providerMetadata }).from(messages).where(and(eq(messages.organizationId, input.organizationId), inArray(messages.conversationId, rows.map((row) => row.id)))).orderBy(messages.conversationId, desc(messages.occurredAt), desc(messages.id)) : [];
    const latestMessageByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
    const latestAttachmentRows = latestMessages.length ? await database.select({ messageId: messageAttachments.messageId, fileName: messageAttachments.fileName }).from(messageAttachments).where(and(eq(messageAttachments.organizationId, input.organizationId), inArray(messageAttachments.messageId, latestMessages.map((message) => message.id)))) : [];
    const latestAttachmentByMessage = new Map(latestAttachmentRows.map((attachment) => [attachment.messageId, attachment.fileName]));
    const conversationPersonIds = rows.flatMap((row) => row.personId ? [row.personId] : []);
    const leadRows = conversationPersonIds.length ? await database.select({ accountId: leads.accountId, personId: sql<string>`coalesce(${leadContacts.personId}, ${leads.personId})`, status: leads.status, source: leads.source, nextActionAt: leads.nextActionAt, updatedAt: leads.updatedAt }).from(leads)
      .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.organizationId, leads.organizationId), inArray(leadContacts.personId, conversationPersonIds)))
      .where(and(eq(leads.organizationId, input.organizationId), or(inArray(leadContacts.personId, conversationPersonIds), inArray(leads.personId, conversationPersonIds))))
      .orderBy(desc(leads.updatedAt), desc(leads.id)) : [];
    const leadByContact = new Map<string, typeof leadRows[number]>();
    for (const lead of leadRows) { const key = `${lead.accountId}:${lead.personId}`; if (!leadByContact.has(key)) leadByContact.set(key, lead); }
    const tagRows = rows.length ? await database.select({ conversationId: conversationTagLinks.conversationId, id: conversationTags.id, name: conversationTags.name, color: conversationTags.color }).from(conversationTagLinks)
      .innerJoin(conversationTags, and(eq(conversationTags.id, conversationTagLinks.tagId), eq(conversationTags.organizationId, conversationTagLinks.organizationId)))
      .where(and(eq(conversationTagLinks.organizationId, input.organizationId), inArray(conversationTagLinks.conversationId, rows.map((row) => row.id)))).orderBy(asc(conversationTags.name)) : [];
    const tagsByConversation = new Map<string, ConversationTagDto[]>();
    for (const tag of tagRows) {
      const conversationTagsForRow = tagsByConversation.get(tag.conversationId);
      if (conversationTagsForRow) conversationTagsForRow.push(new ConversationTagDto(tag.id, tag.name, tag.color));
      else tagsByConversation.set(tag.conversationId, [new ConversationTagDto(tag.id, tag.name, tag.color)]);
    }
    const assistantSettings = rows.length ? await database.select({ businessLineId: agentSettings.businessLineId, enabled: agentSettings.enabled }).from(agentSettings).where(and(eq(agentSettings.organizationId, input.organizationId), eq(agentSettings.agentKey, 'assistant'))) : [];
    const lineAssistantSettings = new Map<string, boolean>(assistantSettings.flatMap((setting) => setting.businessLineId ? [[setting.businessLineId, setting.enabled] as const] : []));
    const globalAssistantEnabled = assistantSettings.find((setting) => setting.businessLineId === null)?.enabled ?? false;
    const data = rows.map((row) => { const lead = row.personId ? leadByContact.get(`${row.accountId}:${row.personId}`) : undefined; const canReply = row.conversationType === 'group' ? row.provider === 'evolution' : Boolean(row.personPhone); const latestMessage = latestMessageByConversation.get(row.id); const encryptedReaction = Boolean(latestMessage?.providerMetadata?.evolution?.encryptedReaction); const latestPreview = latestMessage?.bodyText ?? (encryptedReaction ? null : latestMessage ? latestAttachmentByMessage.get(latestMessage.id) ?? latestMessage.providerMetadata?.evolution?.reaction?.emoji ?? null : null); const previewKind = encryptedReaction ? 'encrypted_reaction' : latestPreview ? 'text' : latestMessage ? 'non_text' : null; const assistantResumeAvailable = (!row.businessLineId || row.businessLineStatus === BUSINESS_LINE_STATUS.active) && (row.businessLineId ? lineAssistantSettings.get(row.businessLineId) ?? globalAssistantEnabled : globalAssistantEnabled); return new ConversationListItemDto(row.id, row.provider, row.status, row.accountName, row.personName, row.personEmail, row.personPhone, lead ? new ConversationLeadSummaryDto(lead.status, lead.source, lead.nextActionAt?.toISOString() ?? null) : null, row.lastMessageAt?.toISOString() ?? null, row.createdAt.toISOString(), row.channelId, row.channelName, row.channelPhoneNumber, row.channelProvider, row.ownerUserId, row.ownerName, conversationAutomationModeSchema.parse(row.automationMode), Boolean(canReply && row.channelActive && row.channelConfigured), row.unread, tagsByConversation.get(row.id) ?? [], row.qualificationIntent && row.qualificationSummary && row.qualificationUpdatedAt ? new AssistantQualificationDto(row.qualificationIntent, row.qualificationSummary, row.confirmedFacts, row.unknowns, row.nextStep ?? '', row.qualificationUpdatedAt.toISOString()) : null, row.businessLineId, row.businessLineName, row.providerArchived, row.providerPinned, row.providerUnreadCount, row.providerDeleted, row.conversationType === 'group' ? 'group' : 'direct', row.displayName, latestPreview, latestMessage?.direction ?? null, latestMessage?.deliveryState ?? null, row.firstUnreadMessageId, previewKind, assistantResumeAvailable); });
    return new ConversationPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }

  private async accessibleBusinessLineIds(organizationId: string, userId: string): Promise<string[]> {
    const rows = await database.select({ businessLineId: businessLineMembers.businessLineId }).from(businessLineMembers)
      .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
      .innerJoin(businessLines, and(eq(businessLines.id, businessLineMembers.businessLineId), eq(businessLines.organizationId, businessLineMembers.organizationId)))
      .where(and(eq(businessLineMembers.organizationId, organizationId), eq(authMember.userId, userId), eq(businessLines.status, 'active')));
    return rows.map((row) => row.businessLineId);
  }

  async listTags(organizationId: string): Promise<ConversationTagDto[]> {
    const rows = await database.select({ id: conversationTags.id, name: conversationTags.name, color: conversationTags.color }).from(conversationTags)
      .where(eq(conversationTags.organizationId, organizationId)).orderBy(asc(conversationTags.name));
    return rows.map((row) => new ConversationTagDto(row.id, row.name, row.color));
  }

  async addTag(input: ConversationTagMutationDto): Promise<ConversationTagDto | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const name = input.name.trim().replace(/\s+/g, ' ');
      const normalizedName = name.toLocaleLowerCase('en-US');
      const [tag] = await transaction.insert(conversationTags).values({ organizationId: input.organizationId, name, normalizedName, color: input.color, createdByUserId: input.actorUserId })
        .onConflictDoUpdate({ target: [conversationTags.organizationId, conversationTags.normalizedName], set: { name } })
        .returning({ id: conversationTags.id, name: conversationTags.name, color: conversationTags.color });
      const [link] = await transaction.insert(conversationTagLinks).values({ organizationId: input.organizationId, conversationId: input.conversationId, tagId: tag.id, createdByUserId: input.actorUserId })
        .onConflictDoNothing({ target: [conversationTagLinks.organizationId, conversationTagLinks.conversationId, conversationTagLinks.tagId] }).returning({ id: conversationTagLinks.id });
      if (link) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.tag_added', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { tagId: tag.id, tagName: tag.name } });
      return new ConversationTagDto(tag.id, tag.name, tag.color);
    });
  }

  async removeTag(input: ConversationTagRemoveDto): Promise<'ok' | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const [removed] = await transaction.delete(conversationTagLinks).where(and(eq(conversationTagLinks.organizationId, input.organizationId), eq(conversationTagLinks.conversationId, input.conversationId), eq(conversationTagLinks.tagId, input.tagId))).returning({ tagId: conversationTagLinks.tagId });
      if (removed) await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.tag_removed', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { tagId: input.tagId } });
      return 'ok';
    });
  }

  async claim(input: ConversationControlDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      if (current.ownerUserId === input.actorUserId && current.automationMode === 'human') return new ConversationControlResultDto(current.id, input.actorUserId, 'human');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: input.actorUserId, automationMode: 'human', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.claimed', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, conversationAutomationModeSchema.parse(updated.automationMode));
    });
  }

  async release(input: ConversationControlDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      if (!current.ownerUserId && current.automationMode === 'paused') return new ConversationControlResultDto(current.id, null, 'paused');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: null, automationMode: 'paused', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.released', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, conversationAutomationModeSchema.parse(updated.automationMode));
    });
  }

  async assign(input: ConversationAssignDto): Promise<ConversationControlResultDto | 'owned' | 'not_found' | 'invalid_assignee'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (!await this.canAssignToLineInTransaction(transaction, input.organizationId, input.conversationId, input.ownerUserId)) return 'invalid_assignee';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      const [membership] = await transaction.select({ id: authMember.id }).from(authMember)
        .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.ownerUserId), sql`string_to_array(replace(${authMember.role}, ' ', ''), ',') && ARRAY[${conversationAssigneeRoleValues}]::text[]`)).for('share').limit(1);
      if (!membership) return 'invalid_assignee';
      if (current.ownerUserId === input.ownerUserId && current.automationMode === 'human') return new ConversationControlResultDto(current.id, input.ownerUserId, 'human');
      const [updated] = await transaction.update(conversations).set({ ownerUserId: input.ownerUserId, automationMode: 'human', updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      const [auditEvent] = await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.assigned', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } }).returning({ id: auditEvents.id });
      if (input.ownerUserId !== input.actorUserId) await transaction.insert(userNotifications).values({ organizationId: input.organizationId, recipientUserId: input.ownerUserId, conversationId: updated.id, notificationType: 'conversation_assigned', idempotencyKey: `conversation-assigned:${auditEvent.id}` }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, conversationAutomationModeSchema.parse(updated.automationMode));
    });
  }

  async setAutomationMode(input: ConversationAutomationUpdateDto): Promise<ConversationControlResultDto | 'owned' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (current.ownerUserId && current.ownerUserId !== input.actorUserId) return 'owned';
      const ownerUserId = input.mode === 'assistant' ? null : input.mode === 'human' ? input.actorUserId : current.ownerUserId;
      if (current.ownerUserId === ownerUserId && current.automationMode === input.mode) return new ConversationControlResultDto(current.id, current.ownerUserId, input.mode);
      const [updated] = await transaction.update(conversations).set({ ownerUserId, automationMode: input.mode, updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).returning({ id: conversations.id, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: input.mode === 'assistant' ? 'conversation.assistant_resumed' : input.mode === 'paused' ? 'conversation.assistant_paused' : 'conversation.human_mode_set', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { ownerUserId: current.ownerUserId, automationMode: current.automationMode }, afterState: { ownerUserId: updated.ownerUserId, automationMode: updated.automationMode } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return new ConversationControlResultDto(updated.id, updated.ownerUserId, conversationAutomationModeSchema.parse(updated.automationMode));
    });
  }

  async setStatus(input: ConversationStatusUpdateDto): Promise<{ id: string; status: 'open' | 'resolved' } | 'not_owner' | 'not_found'> {
    return database.transaction(async (transaction) => {
      const [current] = await transaction.select({ id: conversations.id, status: conversations.status, ownerUserId: conversations.ownerUserId })
        .from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!current) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      if (current.ownerUserId !== input.actorUserId) return 'not_owner';
      if (current.status === input.status) return { id: current.id, status: input.status };
      const [updated] = await transaction.update(conversations).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId)))
        .returning({ id: conversations.id, status: conversations.status });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: input.status === 'resolved' ? 'conversation.resolved' : 'conversation.reopened', entityType: 'conversation', entityId: updated.id, correlationId: input.correlationId, beforeState: { status: current.status }, afterState: { status: updated.status } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: updated.id, occurredAt: new Date().toISOString() })})`);
      return { id: updated.id, status: conversationStatusUpdateSchema.shape.status.parse(updated.status) };
    });
  }

  async listChannels(organizationId: string, userId: string, canManageAll: boolean): Promise<ChannelRecordDto[]> {
    const accessibleBusinessLineIds = canManageAll ? null : await this.accessibleBusinessLineIds(organizationId, userId);
    const rows = await database.select({ channel: messagingChannels, businessLineName: businessLines.name }).from(messagingChannels)
      .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
      .where(and(eq(messagingChannels.organizationId, organizationId), eq(messagingChannels.isActive, true), accessibleBusinessLineIds ? inArray(messagingChannels.businessLineId, accessibleBusinessLineIds) : undefined))
      .orderBy(messagingChannels.displayName, messagingChannels.id);
    return rows.map(({ channel, businessLineName }) => new ChannelRecordDto(channel.id, channelProviderSchema.parse(channel.provider), channel.displayName, channel.phoneNumber, channel.providerChannelId, channel.providerAccountId, channel.isActive, channel.dailyMessageLimit, channel.dailyLimitTimeZone, 0, channel.createdAt.toISOString(), channel.updatedAt.toISOString(), Boolean(channel.credentialsCiphertext && channel.credentialsIv && channel.credentialsAuthTag), null, null, channelOperationModeSchema.parse(channel.operationMode), channelAssistantScheduleModeSchema.parse(channel.assistantScheduleMode), [], channel.businessLineId, businessLineName));
  }

  async listMessages(input: ConversationMessagesQueryDto): Promise<MessageRecordDto[] | null> {
    const canReadConversation = input.isPlatformOrganizationContext
      ? Boolean((await database.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1))[0])
      : await this.canAccessConversationLine(input.organizationId, input.conversationId, input.userId);
    if (!canReadConversation) return null;
    const rows = await database.select({ id: messages.id, externalMessageId: messages.externalMessageId, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, providerMetadata: messages.providerMetadata, transcriptText: messages.transcriptText, isDeleted: messages.isDeleted, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt })
      .from(messages).leftJoin(authUser, eq(authUser.id, messages.actorUserId)).where(and(eq(messages.conversationId, input.conversationId), eq(messages.organizationId, input.organizationId), notExists(database.select({ id: messageHiddenForUsers.messageId }).from(messageHiddenForUsers).where(and(eq(messageHiddenForUsers.messageId, messages.id), eq(messageHiddenForUsers.organizationId, input.organizationId), eq(messageHiddenForUsers.userId, input.userId)))), input.search ? or(ilike(messages.bodyText, `%${input.search}%`), ilike(messages.transcriptText, `%${input.search}%`)) : undefined, input.search ? eq(messages.isDeleted, false) : undefined))
      .orderBy(desc(messages.occurredAt), desc(messages.id)).limit(input.limit).offset(input.offset);
    const attachmentRows = rows.length ? await database.select({ messageId: messageAttachments.messageId, id: messageAttachments.id, mediaType: messageAttachments.mediaType, mimeType: messageAttachments.mimeType, fileName: messageAttachments.fileName, sizeBytes: messageAttachments.sizeBytes, status: messageAttachments.status, attemptCount: messageAttachments.attemptCount, lastErrorCode: messageAttachments.lastErrorCode, lastErrorStage: messageAttachments.lastErrorStage })
      .from(messageAttachments).where(and(eq(messageAttachments.organizationId, input.organizationId), inArray(messageAttachments.messageId, rows.map((row) => row.id)))) : [];
    const attachmentsByMessage = new Map<string, MessageAttachmentDto[]>();
    for (const attachment of attachmentRows) {
      const messageAttachmentsForRow = attachmentsByMessage.get(attachment.messageId);
      if (messageAttachmentsForRow) messageAttachmentsForRow.push(new MessageAttachmentDto(attachment.id, attachment.mediaType, attachment.mimeType, attachment.fileName, attachment.sizeBytes, attachment.status, attachment.attemptCount, attachment.lastErrorCode, attachment.lastErrorStage));
      else attachmentsByMessage.set(attachment.messageId, [new MessageAttachmentDto(attachment.id, attachment.mediaType, attachment.mimeType, attachment.fileName, attachment.sizeBytes, attachment.status, attachment.attemptCount, attachment.lastErrorCode, attachment.lastErrorStage)]);
    }
    return rows.reverse().map((row) => new MessageRecordDto(row.id, row.direction, row.actorType, row.bodyText, row.deliveryState, row.occurredAt.toISOString(), row.actorUserId, row.actorName, attachmentsByMessage.get(row.id) ?? [], row.transcriptText, row.isDeleted, row.providerMetadata, row.externalMessageId));
  }

  async hideMessageForUser(input: { organizationId: string; conversationId: string; messageId: string; userId: string }): Promise<boolean> {
    if (!await this.canAccessConversationLine(input.organizationId, input.conversationId, input.userId)) return false;
    const [message] = await database.select({ id: messages.id }).from(messages).where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId), eq(messages.organizationId, input.organizationId))).limit(1);
    if (!message) return false;
    await database.insert(messageHiddenForUsers).values({ ...input }).onConflictDoNothing();
    return true;
  }

  async markRead(input: ConversationReadDto): Promise<ConversationReadResultDto | 'not_found' | 'invalid_message'> {
    return database.transaction(async (transaction) => {
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.userId, input.isPlatformOrganizationContext)) return 'not_found';
      let lastInboundMessageId = input.lastInboundMessageId;
      if (!lastInboundMessageId) {
        // A null cursor marks the conversation through its latest inbound message.
        const [latestInbound] = await transaction.select({ id: messages.id }).from(messages)
          .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.direction, 'inbound')))
          .orderBy(desc(messages.createdAt), desc(messages.id)).limit(1);
        lastInboundMessageId = latestInbound?.id ?? null;
        if (!lastInboundMessageId) {
          const [current] = await transaction.select({ lastReadAt: conversationReads.lastReadAt }).from(conversationReads)
            .where(and(eq(conversationReads.organizationId, input.organizationId), eq(conversationReads.conversationId, input.conversationId), eq(conversationReads.userId, input.userId))).limit(1);
          return new ConversationReadResultDto(input.conversationId, current?.lastReadAt?.toISOString() ?? null);
        }
      }
      const [message] = await transaction.select({ createdAt: messages.createdAt }).from(messages)
        .where(and(eq(messages.id, lastInboundMessageId), eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.direction, 'inbound'))).limit(1);
      if (!message) return 'invalid_message';
      const [current] = await transaction.select({ id: conversationReads.id, lastReadAt: conversationReads.lastReadAt, lastReadMessageId: conversationReads.lastReadMessageId }).from(conversationReads)
        .where(and(eq(conversationReads.organizationId, input.organizationId), eq(conversationReads.conversationId, input.conversationId), eq(conversationReads.userId, input.userId))).for('update').limit(1);
      const lastReadAt = message.createdAt;
      if (current?.lastReadMessageId) {
        const [currentMessage] = await transaction.select({ createdAt: messages.createdAt }).from(messages)
          .where(and(eq(messages.id, current.lastReadMessageId), eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId))).limit(1);
        if (currentMessage && (currentMessage.createdAt > lastReadAt || (currentMessage.createdAt.getTime() === lastReadAt.getTime() && current.lastReadMessageId >= lastInboundMessageId))) {
          return new ConversationReadResultDto(input.conversationId, current.lastReadAt?.toISOString() ?? currentMessage.createdAt.toISOString());
        }
      } else if (current?.lastReadAt && current.lastReadAt > lastReadAt) {
        return new ConversationReadResultDto(input.conversationId, current.lastReadAt.toISOString());
      }
      if (current) {
        await transaction.update(conversationReads).set({ lastReadAt, lastReadMessageId: lastInboundMessageId, updatedAt: new Date() }).where(and(eq(conversationReads.id, current.id), eq(conversationReads.organizationId, input.organizationId)));
      } else {
        await transaction.insert(conversationReads).values({ organizationId: input.organizationId, conversationId: input.conversationId, userId: input.userId, lastReadAt, lastReadMessageId: lastInboundMessageId });
      }
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: 'conversation.marked_read', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { lastReadAt: lastReadAt.toISOString(), lastInboundMessageId } });
      return new ConversationReadResultDto(input.conversationId, lastReadAt.toISOString());
    });
  }

  async addNote(input: ConversationNoteCreateDto): Promise<MessageRecordDto | 'not_found' | 'not_owner'> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, ownerUserId: conversations.ownerUserId }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      if (!await this.canAccessConversationLineInTransaction(transaction, input.organizationId, input.conversationId, input.actorUserId, input.isPlatformOrganizationContext)) return 'not_found';
      const [duplicate] = await transaction.select({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt }).from(messages)
        .leftJoin(authUser, eq(authUser.id, messages.actorUserId))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.idempotencyKey, input.idempotencyKey))).limit(1);
      if (duplicate) return new MessageRecordDto(duplicate.id, duplicate.direction, duplicate.actorType, duplicate.bodyText, duplicate.deliveryState, duplicate.occurredAt.toISOString(), duplicate.actorUserId, duplicate.actorName);
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      const [actor] = await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, input.actorUserId)).limit(1);
      const occurredAt = new Date();
      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId: input.conversationId, direction: 'internal', actorType: 'user', actorUserId: input.actorUserId, bodyText: input.bodyText, deliveryState: 'unknown', idempotencyKey: input.idempotencyKey, occurredAt }).returning({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.internal_note_added', entityType: 'conversation', entityId: input.conversationId, correlationId: input.correlationId, afterState: { messageId: message.id } });
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: input.conversationId, occurredAt: occurredAt.toISOString() })})`);
      return new MessageRecordDto(message.id, message.direction, message.actorType, message.bodyText, message.deliveryState, message.occurredAt.toISOString(), message.actorUserId, actor?.name ?? null);
    });
  }

  async prepareMessageSend(input: ConversationMessageSendDto): Promise<MessageSendResult> {
    return database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({ id: conversations.id, personId: conversations.personId, channelId: conversations.channelId, conversationType: conversations.conversationType, providerRecipientId: conversations.providerRecipientId, ownerUserId: conversations.ownerUserId, automationMode: conversations.automationMode }).from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId))).for('update').limit(1);
      if (!conversation) return 'not_found';
      const membership = input.isPlatformOrganizationContext ? null : (await transaction.select({ role: authMember.role }).from(authMember)
        .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, input.actorUserId))).for('share').limit(1))[0] ?? null;
      if (!input.isPlatformOrganizationContext && !membership) return 'not_found';
      if (!input.isPlatformOrganizationContext && membership && !hasOrganizationRole(membership.role, ORGANIZATION_MANAGEMENT_ROLES)) {
        if (!conversation.channelId) return 'not_found';
        const [channelLine] = await transaction.select({ businessLineId: messagingChannels.businessLineId }).from(messagingChannels)
          .where(and(eq(messagingChannels.id, conversation.channelId), eq(messagingChannels.organizationId, input.organizationId))).limit(1);
        if (!channelLine?.businessLineId) return 'not_found';
        const [line] = await transaction.select({ id: businessLines.id, status: businessLines.status }).from(businessLines)
          .where(and(eq(businessLines.id, channelLine.businessLineId), eq(businessLines.organizationId, input.organizationId))).for('share').limit(1);
        if (!line || line.status !== 'active') return 'not_found';
        const [lineMembership] = await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
          .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
          .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, line.id), eq(authMember.userId, input.actorUserId))).limit(1);
        if (!lineMembership) return 'not_found';
      }
      const [duplicate] = await transaction.select({ id: messages.id, externalMessageId: messages.externalMessageId, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, actorName: authUser.name, bodyText: messages.bodyText, providerMetadata: messages.providerMetadata, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt }).from(messages)
        .leftJoin(authUser, eq(authUser.id, messages.actorUserId))
        .where(and(eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId), eq(messages.idempotencyKey, input.idempotencyKey))).limit(1);
      if (duplicate) {
        const [attachment] = await transaction.select({ id: messageAttachments.id, mediaType: messageAttachments.mediaType, mimeType: messageAttachments.mimeType, fileName: messageAttachments.fileName, sizeBytes: messageAttachments.sizeBytes, status: messageAttachments.status }).from(messageAttachments)
          .where(and(eq(messageAttachments.messageId, duplicate.id), eq(messageAttachments.organizationId, input.organizationId))).limit(1);
        const attachments = attachment ? [new MessageAttachmentDto(attachment.id, attachment.mediaType, attachment.mimeType, attachment.fileName, attachment.sizeBytes, attachment.status)] : [];
        return { kind: 'duplicate', message: new MessageRecordDto(duplicate.id, duplicate.direction, duplicate.actorType, duplicate.bodyText, duplicate.deliveryState, duplicate.occurredAt.toISOString(), duplicate.actorUserId, duplicate.actorName, attachments, null, false, duplicate.providerMetadata, duplicate.externalMessageId) };
      }
      if (conversation.ownerUserId !== input.actorUserId) return 'not_owner';
      if (conversation.automationMode !== 'human') return 'automation_not_human';
      if (!conversation.channelId || (conversation.conversationType === 'direct' && !conversation.personId)) return 'channel_unavailable';
      let targetMessage: PreparedMessageSend['targetMessage'] = null;
      let providerMetadata: import('../db/schema').MessageProviderMetadata | null = null;
      if (input.targetMessageId) {
        const [target] = await transaction.select({ externalMessageId: messages.externalMessageId, direction: messages.direction, bodyText: messages.bodyText, isDeleted: messages.isDeleted, providerMetadata: messages.providerMetadata }).from(messages)
          .where(and(eq(messages.id, input.targetMessageId), eq(messages.organizationId, input.organizationId), eq(messages.conversationId, input.conversationId))).limit(1);
        if (!target || !target.externalMessageId || target.isDeleted || (input.mode === 'reply' && !target.bodyText)) return 'target_message_unavailable';
        const authorPhone = target.providerMetadata?.evolution?.author?.phone ?? null;
        const participant = authorPhone && !authorPhone.includes('@') ? `${authorPhone}@s.whatsapp.net` : authorPhone;
        targetMessage = { externalMessageId: target.externalMessageId, remoteJid: conversation.providerRecipientId, fromMe: target.direction === 'outbound', participant, bodyText: target.bodyText };
        providerMetadata = input.mode === 'reaction'
          ? { evolution: { reaction: { targetExternalMessageId: target.externalMessageId, emoji: input.bodyText ?? '' } } }
          : { evolution: { quotedMessage: { externalMessageId: target.externalMessageId, bodyText: target.bodyText } } };
      }
      if (input.mode === 'reaction' && !targetMessage) return 'target_message_unavailable';
      const [channel] = await transaction.select({ provider: messagingChannels.provider, providerChannelId: messagingChannels.providerChannelId, isActive: messagingChannels.isActive, lineStatus: businessLines.status, connectionStatus: messagingChannels.connectionStatus, dailyMessageLimit: messagingChannels.dailyMessageLimit, dailyLimitTimeZone: messagingChannels.dailyLimitTimeZone, credentialsCiphertext: messagingChannels.credentialsCiphertext, credentialsIv: messagingChannels.credentialsIv, credentialsAuthTag: messagingChannels.credentialsAuthTag }).from(messagingChannels)
        .leftJoin(businessLines, and(eq(businessLines.id, messagingChannels.businessLineId), eq(businessLines.organizationId, messagingChannels.organizationId)))
        .where(and(eq(messagingChannels.id, conversation.channelId), eq(messagingChannels.organizationId, input.organizationId))).for('update', { of: messagingChannels }).limit(1);
      if (!channel?.isActive || (channel.lineStatus && channel.lineStatus !== 'active')) return 'channel_unavailable';
      if (!channel.credentialsCiphertext || !channel.credentialsIv || !channel.credentialsAuthTag) return 'credentials_missing';
      const channelProvider = channelProviderSchema.safeParse(channel.provider);
      if (!channelProvider.success) return 'channel_unavailable';
      if (conversation.conversationType === 'group' && (channelProvider.data !== CHANNEL_PROVIDER.evolution || !conversation.providerRecipientId?.endsWith('@g.us'))) return 'channel_unavailable';
      let recipientPhone = conversation.providerRecipientId ?? '';
      if (conversation.conversationType === 'direct' && conversation.personId) {
        const [person] = await transaction.select({ phone: people.phone }).from(people).where(and(eq(people.id, conversation.personId), eq(people.organizationId, input.organizationId))).limit(1);
        recipientPhone = (person?.phone ?? '').replace(/\D/g, '');
        if (recipientPhone.length < 8 || recipientPhone.length > 15 || recipientPhone[0] === '0') return 'recipient_missing';
      }
      if (channelProvider.data === CHANNEL_PROVIDER.evolution && CHANNEL_SEND_BLOCKED_CONNECTION_STATUSES.some((status) => status === channel.connectionStatus)) return CHANNEL_CONNECTION_ERROR.unavailable;
      const [quota] = await transaction.select({ used: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.organizationId, messages.organizationId)))
        .where(and(eq(messages.organizationId, input.organizationId), eq(conversations.channelId, conversation.channelId), eq(messages.direction, CHANNEL_QUOTA_COUNTED_DIRECTION), sql`${messages.deliveryState} <> ${CHANNEL_QUOTA_EXCLUDED_DELIVERY_STATE}`, sql`(${messages.occurredAt} at time zone ${channel.dailyLimitTimeZone})::date = (now() at time zone ${channel.dailyLimitTimeZone})::date`));
      if ((quota?.used ?? 0) >= channel.dailyMessageLimit) return CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached;
      const [message] = await transaction.insert(messages).values({ organizationId: input.organizationId, conversationId: input.conversationId, direction: 'outbound', actorType: 'user', actorUserId: input.actorUserId, bodyText: input.bodyText, providerMetadata, deliveryState: 'requested', idempotencyKey: input.idempotencyKey, occurredAt: new Date() }).returning({ id: messages.id, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      const attachments = input.attachment ? [input.attachment] : [];
      if (input.attachment) await transaction.insert(messageAttachments).values({ id: input.attachment.id, organizationId: input.organizationId, messageId: message.id, channelId: conversation.channelId, provider: channelProvider.data, mediaType: input.attachment.mediaType, mimeType: input.attachment.mimeType, fileName: input.attachment.fileName, sizeBytes: input.attachment.sizeBytes, sha256: input.attachment.sha256, status: OUTBOUND_MEDIA_ATTACHMENT_STATUS.pending });
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'conversation.message_requested', entityType: 'conversation', entityId: conversation.id, correlationId: input.correlationId, afterState: { messageId: message.id, channelProvider: channel.provider, deliveryState: 'requested', mediaType: input.attachment?.mediaType ?? null, fileName: input.attachment?.fileName ?? null, sizeBytes: input.attachment?.sizeBytes ?? null } });
      return {
        kind: 'prepared', message: new MessageRecordDto(message.id, message.direction, message.actorType, message.bodyText, message.deliveryState, message.occurredAt.toISOString(), message.actorUserId, null, attachments.map((attachment) => new MessageAttachmentDto(attachment.id, attachment.mediaType, attachment.mimeType, attachment.fileName, attachment.sizeBytes, OUTBOUND_MEDIA_ATTACHMENT_STATUS.pending)), null, false, providerMetadata), channelId: conversation.channelId, recipientPhone, targetMessage,
        provider: channelProvider.data, providerChannelId: channel.providerChannelId,
        credentials: { ciphertext: channel.credentialsCiphertext, iv: channel.credentialsIv, authTag: channel.credentialsAuthTag },
      };
    });
  }

  async updateMessageDelivery(input: ConversationMessageDeliveryDto): Promise<MessageRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [row] = await transaction.update(messages).set({ deliveryState: input.deliveryState, externalMessageId: input.externalMessageId })
        .where(and(eq(messages.id, input.messageId), eq(messages.organizationId, input.organizationId))).returning({ id: messages.id, conversationId: messages.conversationId, direction: messages.direction, actorType: messages.actorType, actorUserId: messages.actorUserId, bodyText: messages.bodyText, providerMetadata: messages.providerMetadata, externalMessageId: messages.externalMessageId, deliveryState: messages.deliveryState, occurredAt: messages.occurredAt });
      if (!row) return null;
      let finalDeliveryState = row.deliveryState;
      if (row.direction === 'outbound' && input.externalMessageId) {
        const [conversation] = await transaction.select({ channelId: conversations.channelId, provider: conversations.provider }).from(conversations)
          .where(and(eq(conversations.id, row.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1);
        if (conversation?.provider === 'evolution' && conversation.channelId) {
          finalDeliveryState = await applyPendingEvolutionMessageStatuses(transaction, {
            organizationId: input.organizationId, channelId: conversation.channelId, messageId: row.id,
            externalMessageId: input.externalMessageId, currentState: row.deliveryState,
          });
        }
        if (finalDeliveryState !== row.deliveryState) {
          await transaction.update(messages).set({ deliveryState: finalDeliveryState })
            .where(and(eq(messages.id, row.id), eq(messages.organizationId, input.organizationId)));
        }
      }
      const [actor] = row.actorUserId ? await transaction.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, row.actorUserId)).limit(1) : [];
      const attachments = await transaction.select({ id: messageAttachments.id, mediaType: messageAttachments.mediaType, mimeType: messageAttachments.mimeType, fileName: messageAttachments.fileName, sizeBytes: messageAttachments.sizeBytes, status: messageAttachments.status }).from(messageAttachments)
        .where(and(eq(messageAttachments.messageId, row.id), eq(messageAttachments.organizationId, input.organizationId)));
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: `conversation.message_${finalDeliveryState}`, entityType: 'conversation', entityId: row.conversationId, correlationId: input.correlationId, afterState: { messageId: row.id, deliveryState: finalDeliveryState, externalMessageId: input.externalMessageId } });
      if (finalDeliveryState === 'failed' && row.direction === 'outbound') {
        const [conversation] = await transaction.select({ ownerUserId: conversations.ownerUserId }).from(conversations)
          .where(and(eq(conversations.id, row.conversationId), eq(conversations.organizationId, input.organizationId))).limit(1);
        const recipientUserId = conversation?.ownerUserId ?? input.actorUserId;
        const [recipient] = await transaction.select({ userId: authMember.userId }).from(authMember)
          .where(and(eq(authMember.organizationId, input.organizationId), eq(authMember.userId, recipientUserId))).limit(1);
        if (recipient) await transaction.insert(userNotifications).values({
          organizationId: input.organizationId,
          recipientUserId: recipient.userId,
          conversationId: row.conversationId,
          notificationType: USER_NOTIFICATION_TYPE.messageDeliveryFailed,
          idempotencyKey: `message-delivery-failed:${row.id}:${recipient.userId}`,
        }).onConflictDoNothing({ target: [userNotifications.organizationId, userNotifications.recipientUserId, userNotifications.idempotencyKey] });
      }
      await transaction.execute(sql`select pg_notify('sales_inbox_updates', ${JSON.stringify({ organizationId: input.organizationId, conversationId: row.conversationId, occurredAt: row.occurredAt.toISOString() })})`);
      return new MessageRecordDto(row.id, row.direction, row.actorType, row.bodyText, finalDeliveryState, row.occurredAt.toISOString(), row.actorUserId, actor?.name ?? null, attachments.map((attachment) => new MessageAttachmentDto(attachment.id, attachment.mediaType, attachment.mimeType, attachment.fileName, attachment.sizeBytes, attachment.status)), null, false, row.providerMetadata, row.externalMessageId);
    });
  }

  async markOutboundAttachmentAvailable(organizationId: string, messageId: string, attachmentId: string, storageKey: string): Promise<boolean> {
    const rows = await database.update(messageAttachments).set({ storageKey, status: OUTBOUND_MEDIA_ATTACHMENT_STATUS.available, updatedAt: new Date() })
      .where(and(eq(messageAttachments.id, attachmentId), eq(messageAttachments.messageId, messageId), eq(messageAttachments.organizationId, organizationId), eq(messageAttachments.status, OUTBOUND_MEDIA_ATTACHMENT_STATUS.pending)))
      .returning({ id: messageAttachments.id });
    return rows.length === 1;
  }

  async markOutboundAttachmentFailed(organizationId: string, messageId: string, attachmentId: string): Promise<void> {
    await database.update(messageAttachments).set({ status: OUTBOUND_MEDIA_ATTACHMENT_STATUS.failed, lastErrorCode: OUTBOUND_MEDIA_ERROR.storageFailed, updatedAt: new Date() })
      .where(and(eq(messageAttachments.id, attachmentId), eq(messageAttachments.messageId, messageId), eq(messageAttachments.organizationId, organizationId), eq(messageAttachments.status, OUTBOUND_MEDIA_ATTACHMENT_STATUS.pending)));
  }
}
