import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listConversationsSchema } from './inbox.dto';
import type { ListConversationsQueryDto } from './inbox.dto';
import { InboxService } from './inbox.service';

const conversationIdSchema = z.string().uuid();
const listMessagesSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).strict();
type ListMessagesQueryDto = z.infer<typeof listMessagesSchema>;
@Controller('api/v1/conversations')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listConversationsSchema)) query: ListConversationsQueryDto) { return this.inboxService.list(request, query); }
  @Get('channels')
  channels(@ApiRequest() request: ApiRequestDto) { return this.inboxService.channels(request); }
  @Get(':id/messages')
  messages(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Query(new ZodValidationPipe(listMessagesSchema)) query: ListMessagesQueryDto) { return this.inboxService.messages(request, conversationId, query); }
}
