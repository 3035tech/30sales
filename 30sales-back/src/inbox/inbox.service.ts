import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ConversationAutomationMode, ConversationAutomationUpdateDto, ConversationControlDto, ConversationListItemDto, ConversationMessagesQueryDto, ConversationRepositoryListDto, ListConversationsQueryDto, MessageRecordDto } from './inbox.dto';
import { InboxRepository } from './inbox.repository';

@Injectable()
export class InboxService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: InboxRepository) {}
  async list(request: ApiRequestDto, query: ListConversationsQueryDto): Promise<ConversationListItemDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.list(new ConversationRepositoryListDto(context.organizationId, query));
  }
  async channels(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listChannels(context.organizationId);
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
  async setAutomationMode(request: ApiRequestDto, conversationId: string, mode: ConversationAutomationMode) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.setAutomationMode(new ConversationAutomationUpdateDto(context.organizationId, conversationId, context.userId, mode, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can change this conversation automation mode.' });
    return result;
  }
}
