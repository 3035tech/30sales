import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssignConversationDto, ConversationAssignDto, ConversationAutomationMode, ConversationAutomationUpdateDto, ConversationContactReconcileDto, ConversationControlDto, ConversationMessageDeliveryDto, ConversationMessageSendDto, ConversationMessagesQueryDto, ConversationNoteCreateDto, ConversationPageDto, ConversationReadDto, ConversationRepositoryListDto, ConversationStatusUpdateDto, ConversationTagMutationDto, ConversationTagRemoveDto, CreateConversationNoteDto, CreateConversationTagDto, ListConversationsQueryDto, MarkConversationReadInputDto, MessageRecordDto, SendConversationMessageDto, SendConversationMediaDto, SendConversationContactDto, type ConversationStatusUpdateInputDto, type ReconcileConversationContactInputDto } from './inbox.dto';
import { InboxRepository } from './inbox.repository';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { WhatsappTextProviderService } from './whatsapp-text-provider.service';
import { WhatsappMediaProviderService } from './whatsapp-media-provider.service';
import { WhatsappContactProviderService } from './whatsapp-contact-provider.service';
import { MEDIA_STORAGE, type MediaStorage } from '../attachments/media-storage';
import { prepareOutboundMedia, type IncomingMediaFile, type PreparedOutboundMedia } from './outbound-media';
import { OUTBOUND_MEDIA_ERROR, OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';
import { InboxRealtimeService } from './inbox-realtime.service';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { CHANNEL_CONNECTION_ERROR, CHANNEL_MESSAGE_QUOTA_ERROR } from '../channels/channels.constants';
import { INBOX_CONTACT_RECONCILIATION_ERROR_CODE, INBOX_CONTACT_RECONCILIATION_RESULT } from './inbox.constants';

@Injectable()
export class InboxService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: InboxRepository, private readonly credentialResolver: ChannelCredentialResolverService, private readonly textProvider: WhatsappTextProviderService, private readonly mediaProvider: WhatsappMediaProviderService, private readonly contactProvider: WhatsappContactProviderService, private readonly realtime: InboxRealtimeService, @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}
  async events(request: ApiRequestDto): Promise<Observable<MessageEvent>> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.realtime.stream(context.organizationId, context.userId);
  }
  async list(request: ApiRequestDto, query: ListConversationsQueryDto): Promise<ConversationPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return this.repository.list(new ConversationRepositoryListDto(context.organizationId, context.userId, canManageAll, query));
  }
  async channels(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listChannels(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES));
  }
  async tags(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listTags(context.organizationId);
  }
  async assignees(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listAssignees(context.organizationId);
  }
  async messages(request: ApiRequestDto, conversationId: string, query: { limit: number; offset: number }): Promise<MessageRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const records = await this.repository.listMessages(new ConversationMessagesQueryDto(context.organizationId, conversationId, context.userId, query.limit, query.offset, context.isPlatformOrganizationContext));
    if (!records) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    return records;
  }
  async markRead(request: ApiRequestDto, conversationId: string, input: MarkConversationReadInputDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const result = await this.repository.markRead(new ConversationReadDto(context.organizationId, conversationId, context.userId, input.lastInboundMessageId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'invalid_message') throw new BadRequestException({ code: 'INVALID_READ_CURSOR', message: 'The read cursor must reference an inbound message in this conversation.' });
    return result;
  }
  async claim(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.claim(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_ALREADY_ASSIGNED', message: 'Another teammate already owns this conversation.' });
    return result;
  }
  async release(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.release(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can release this conversation.' });
    return result;
  }
  async assign(request: ApiRequestDto, conversationId: string, input: AssignConversationDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.assign(new ConversationAssignDto(context.organizationId, conversationId, context.userId, input.ownerUserId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can transfer this conversation.' });
    if (result === 'invalid_assignee') throw new BadRequestException({ code: 'INVALID_CONVERSATION_ASSIGNEE', message: 'The assignee must be an active member of the current organization.' });
    return result;
  }
  async setAutomationMode(request: ApiRequestDto, conversationId: string, mode: ConversationAutomationMode) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    if (mode === 'assistant' && !await this.repository.isAssistantEnabled(context.organizationId, conversationId)) throw new ConflictException({ code: 'ASSISTANT_AGENT_DISABLED', message: 'Enable Assistant for this business line before returning the conversation to automated handling.' });
    const result = await this.repository.setAutomationMode(new ConversationAutomationUpdateDto(context.organizationId, conversationId, context.userId, mode, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can change this conversation automation mode.' });
    return result;
  }
  async setStatus(request: ApiRequestDto, conversationId: string, input: ConversationStatusUpdateInputDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.setStatus(new ConversationStatusUpdateDto(context.organizationId, conversationId, context.userId, input.status, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the current conversation owner can change its status.' });
    return result;
  }
  async reconcileContact(request: ApiRequestDto, conversationId: string, input: ReconcileConversationContactInputDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.reconcileContact(new ConversationContactReconcileDto(context.organizationId, conversationId, context.userId, input.leadId, input.name, input.phone, input.isPrimary, input.isInterested, request.correlationId, context.isPlatformOrganizationContext));
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.notFound) throw new NotFoundException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.notFound, message: 'Conversation or lead was not found in the active organization.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.missingContact) throw new ConflictException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.missingContact, message: 'This conversation has no contact to associate.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.invalidPhone) throw new BadRequestException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.invalidPhone, message: 'Enter a valid international phone number.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.notOwner) throw new ForbiddenException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.ownerRequired, message: 'Take ownership of the conversation before updating its contact.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.contactSharedAcrossLines) throw new ConflictException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.contactSharedAcrossLines, message: 'This contact is linked to another business line. Update the shared contact from an organization management workflow.' });
    return result;
  }
  async sendMessage(request: ApiRequestDto, conversationId: string, input: SendConversationMessageDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, input.bodyText, input.idempotencyKey, request.correlationId, null, null, context.isPlatformOrganizationContext);
  }
  async sendMediaMessage(request: ApiRequestDto, conversationId: string, input: SendConversationMediaDto, file: IncomingMediaFile | undefined): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const media = prepareOutboundMedia(file);
    const bodyText = input.bodyText?.trim() || null;
    if (media.metadata.mediaType === OUTBOUND_MEDIA_TYPE.audio && bodyText) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.audioCaptionUnsupported, message: 'Audio messages cannot include a caption. Send the text separately.' });
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, bodyText, input.idempotencyKey, request.correlationId, media, null, context.isPlatformOrganizationContext);
  }
  async sendContactMessage(request: ApiRequestDto, conversationId: string, input: SendConversationContactDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const phoneDigits = input.phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15 || phoneDigits.startsWith('0')) throw new BadRequestException({ code: 'INVALID_CONTACT_PHONE', message: 'Enter a valid international phone number, including the country code.' });
    const bodyText = [input.fullName, `+${phoneDigits}`, input.organization, input.email, input.url].filter(Boolean).join(' · ');
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, bodyText, input.idempotencyKey, request.correlationId, null, input, context.isPlatformOrganizationContext);
  }
  private async sendHumanMessage(organizationId: string, userId: string, conversationId: string, bodyText: string | null, idempotencyKey: string, correlationId: string | null, media: PreparedOutboundMedia | null, contact: SendConversationContactDto | null, isPlatformOrganizationContext: boolean): Promise<MessageRecordDto> {
    const prepared = await this.repository.prepareMessageSend(new ConversationMessageSendDto(organizationId, conversationId, userId, bodyText, idempotencyKey, correlationId, media?.metadata ?? null, isPlatformOrganizationContext));
    if (prepared === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (prepared === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can send a human reply.' });
    if (prepared === 'automation_not_human') throw new ConflictException({ code: 'CONVERSATION_NOT_IN_HUMAN_MODE', message: 'Assume the conversation before sending a human reply.' });
    if (prepared === 'channel_unavailable') throw new ConflictException({ code: 'CHANNEL_UNAVAILABLE', message: 'The conversation has no active WhatsApp channel.' });
    if (prepared === 'credentials_missing') throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure credentials for the WhatsApp channel before replying.' });
    if (prepared === 'recipient_missing') throw new BadRequestException({ code: 'RECIPIENT_PHONE_MISSING', message: 'The contact needs a valid phone number before sending.' });
    if (prepared === CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached) throw new ConflictException({ code: CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached, message: 'The daily message limit for this WhatsApp number has been reached.' });
    if (prepared === CHANNEL_CONNECTION_ERROR.unavailable) throw new ConflictException({ code: CHANNEL_CONNECTION_ERROR.unavailable, message: 'The Evolution API instance is not connected. Restore its connection before sending.' });
    if (prepared.kind === 'duplicate') return prepared.message;
    let delivery: { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };
    if (media) {
      let storageKey: string | null = null;
      try {
        storageKey = await this.storage.put(organizationId, media.metadata.id, media.content);
        if (!await this.repository.markOutboundAttachmentAvailable(organizationId, prepared.message.id, media.metadata.id, storageKey)) throw new Error('MEDIA_ATTACHMENT_RECORD_MISSING');
      } catch {
        if (storageKey) await this.storage.remove(storageKey).catch(() => undefined);
        await this.repository.markOutboundAttachmentFailed(organizationId, prepared.message.id, media.metadata.id);
        const failed = await this.repository.updateMessageDelivery(new ConversationMessageDeliveryDto(organizationId, prepared.message.id, userId, 'failed', null, correlationId));
        if (!failed) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'The outbound message could not be found.' });
        return failed;
      }
    }
    try {
      const credentials = await this.credentialResolver.resolve(organizationId, prepared.channelId, prepared.credentials);
      if (credentials.provider !== prepared.provider) throw new Error('Channel credential provider mismatch.');
      delivery = contact
        ? await this.contactProvider.send({ providerChannelId: prepared.providerChannelId, recipientPhone: prepared.recipientPhone, contact, credentials })
        : media
          ? await this.mediaProvider.send({ providerChannelId: prepared.providerChannelId, recipientPhone: prepared.recipientPhone, bodyText: bodyText ?? '', mediaType: media.metadata.mediaType, mimeType: media.metadata.mimeType, fileName: media.metadata.fileName, content: media.content, credentials })
          : await this.textProvider.send({ provider: prepared.provider, providerChannelId: prepared.providerChannelId, recipientPhone: prepared.recipientPhone, bodyText: bodyText ?? '', credentials });
    } catch {
      delivery = { deliveryState: 'failed', externalMessageId: null };
    }
    const updated = await this.repository.updateMessageDelivery(new ConversationMessageDeliveryDto(organizationId, prepared.message.id, userId, delivery.deliveryState, delivery.externalMessageId, correlationId));
    if (!updated) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'The outbound message could not be found.' });
    return updated;
  }
  async addNote(request: ApiRequestDto, conversationId: string, input: CreateConversationNoteDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addNote(new ConversationNoteCreateDto(context.organizationId, conversationId, context.userId, input.bodyText, input.idempotencyKey, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add an internal note.' });
    return result;
  }
  async addTag(request: ApiRequestDto, conversationId: string, input: CreateConversationTagDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addTag(new ConversationTagMutationDto(context.organizationId, conversationId, context.userId, input.name, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add tags.' });
    return result;
  }
  async removeTag(request: ApiRequestDto, conversationId: string, tagId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.removeTag(new ConversationTagRemoveDto(context.organizationId, conversationId, tagId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can remove tags.' });
    return { success: true };
  }
}
