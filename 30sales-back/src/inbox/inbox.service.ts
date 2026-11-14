import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ConversationListItemDto, ConversationMessagesQueryDto, ConversationRepositoryListDto, ListConversationsQueryDto, MessageRecordDto } from './inbox.dto';
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
}
