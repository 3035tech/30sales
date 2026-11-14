import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssignConversationDto, ConversationAssignDto, ConversationAutomationMode, ConversationAutomationUpdateDto, ConversationControlDto, ConversationListItemDto, ConversationMessageDeliveryDto, ConversationMessageSendDto, ConversationMessagesQueryDto, ConversationNoteCreateDto, ConversationRepositoryListDto, ConversationTagMutationDto, ConversationTagRemoveDto, CreateConversationNoteDto, CreateConversationTagDto, ListConversationsQueryDto, MessageRecordDto, SendConversationMessageDto } from './inbox.dto';
import { InboxRepository } from './inbox.repository';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { WhatsappTextProviderService } from './whatsapp-text-provider.service';

@Injectable()
export class InboxService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: InboxRepository, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly textProvider: WhatsappTextProviderService) {}
  async list(request: ApiRequestDto, query: ListConversationsQueryDto): Promise<ConversationListItemDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.list(new ConversationRepositoryListDto(context.organizationId, query));
  }
  async channels(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listChannels(context.organizationId);
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
    const records = await this.repository.listMessages(new ConversationMessagesQueryDto(context.organizationId, conversationId, query.limit, query.offset));
    if (!records) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    return records;
  }
  async claim(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.claim(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_ALREADY_ASSIGNED', message: 'Another teammate already owns this conversation.' });
    return result;
  }
  async release(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.release(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can release this conversation.' });
    return result;
  }
  async assign(request: ApiRequestDto, conversationId: string, input: AssignConversationDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.assign(new ConversationAssignDto(context.organizationId, conversationId, context.userId, input.ownerUserId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can transfer this conversation.' });
    if (result === 'invalid_assignee') throw new BadRequestException({ code: 'INVALID_CONVERSATION_ASSIGNEE', message: 'The assignee must be an active member of the current organization.' });
    return result;
  }
  async setAutomationMode(request: ApiRequestDto, conversationId: string, mode: ConversationAutomationMode) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.setAutomationMode(new ConversationAutomationUpdateDto(context.organizationId, conversationId, context.userId, mode, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can change this conversation automation mode.' });
    return result;
  }
  async sendMessage(request: ApiRequestDto, conversationId: string, input: SendConversationMessageDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const prepared = await this.repository.prepareMessageSend(new ConversationMessageSendDto(context.organizationId, conversationId, context.userId, input.bodyText, input.idempotencyKey, request.correlationId));
    if (prepared === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (prepared === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can send a human reply.' });
    if (prepared === 'automation_not_human') throw new ConflictException({ code: 'CONVERSATION_NOT_IN_HUMAN_MODE', message: 'Assume the conversation before sending a human reply.' });
    if (prepared === 'channel_unavailable') throw new ConflictException({ code: 'CHANNEL_UNAVAILABLE', message: 'The conversation has no active WhatsApp channel.' });
    if (prepared === 'credentials_missing') throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure credentials for the WhatsApp channel before replying.' });
    if (prepared === 'recipient_missing') throw new BadRequestException({ code: 'RECIPIENT_PHONE_MISSING', message: 'The contact needs a valid phone number before sending.' });
    if (prepared.kind === 'duplicate') return prepared.message;
    let delivery: { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };
    try {
      const credentials = this.credentialCrypto.decrypt(context.organizationId, prepared.channelId, prepared.credentials);
      if (credentials.provider !== prepared.provider) throw new Error('Channel credential provider mismatch.');
      delivery = await this.textProvider.send({ provider: prepared.provider, providerChannelId: prepared.providerChannelId, recipientPhone: prepared.recipientPhone, bodyText: input.bodyText, credentials });
    } catch {
      delivery = { deliveryState: 'failed', externalMessageId: null };
    }
    const updated = await this.repository.updateMessageDelivery(new ConversationMessageDeliveryDto(context.organizationId, prepared.message.id, context.userId, delivery.deliveryState, delivery.externalMessageId, request.correlationId));
    if (!updated) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'The outbound message could not be found.' });
    return updated;
  }
  async addNote(request: ApiRequestDto, conversationId: string, input: CreateConversationNoteDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addNote(new ConversationNoteCreateDto(context.organizationId, conversationId, context.userId, input.bodyText, input.idempotencyKey, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add an internal note.' });
    return result;
  }
  async addTag(request: ApiRequestDto, conversationId: string, input: CreateConversationTagDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addTag(new ConversationTagMutationDto(context.organizationId, conversationId, context.userId, input.name, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add tags.' });
    return result;
  }
  async removeTag(request: ApiRequestDto, conversationId: string, tagId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.removeTag(new ConversationTagRemoveDto(context.organizationId, conversationId, tagId, context.userId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can remove tags.' });
    return { success: true };
  }
}
