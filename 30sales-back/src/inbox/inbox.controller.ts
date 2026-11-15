import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignConversationSchema, conversationAutomationModeSchema, conversationStatusUpdateSchema, createConversationNoteSchema, createConversationTagSchema, listConversationsSchema, markConversationReadSchema, sendConversationMessageSchema } from './inbox.dto';
import type { AssignConversationDto, ConversationStatusUpdateInputDto, CreateConversationNoteDto, CreateConversationTagDto, ListConversationsQueryDto, MarkConversationReadInputDto, SendConversationMessageDto } from './inbox.dto';
import { InboxService } from './inbox.service';

const conversationIdSchema = z.string().uuid();
const listMessagesSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).strict();
type ListMessagesQueryDto = z.infer<typeof listMessagesSchema>;
@Controller('api/v1/conversations')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listConversationsSchema)) query: ListConversationsQueryDto) { return this.inboxService.list(request, query); }
  @Sse('events') events(@ApiRequest() request: ApiRequestDto): Promise<Observable<MessageEvent>> { return this.inboxService.events(request); }
  @Get('channels')
  channels(@ApiRequest() request: ApiRequestDto) { return this.inboxService.channels(request); }
  @Get('assignees')
  assignees(@ApiRequest() request: ApiRequestDto) { return this.inboxService.assignees(request); }
  @Get('tags')
  tags(@ApiRequest() request: ApiRequestDto) { return this.inboxService.tags(request); }
  @Get(':id/messages')
  messages(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Query(new ZodValidationPipe(listMessagesSchema)) query: ListMessagesQueryDto) { return this.inboxService.messages(request, conversationId, query); }
  @Post(':id/read')
  markRead(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(markConversationReadSchema)) input: MarkConversationReadInputDto) { return this.inboxService.markRead(request, conversationId, input); }
  @Post(':id/claim')
  claim(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string) { return this.inboxService.claim(request, conversationId); }
  @Post(':id/release')
  release(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string) { return this.inboxService.release(request, conversationId); }
  @Patch(':id/owner')
  assign(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(assignConversationSchema)) input: AssignConversationDto) { return this.inboxService.assign(request, conversationId, input); }
  @Post(':id/automation')
  setAutomation(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(conversationAutomationModeSchema)) mode: 'assistant' | 'human' | 'paused') { return this.inboxService.setAutomationMode(request, conversationId, mode); }
  @Patch(':id/status')
  setStatus(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(conversationStatusUpdateSchema)) input: ConversationStatusUpdateInputDto) { return this.inboxService.setStatus(request, conversationId, input); }
  @Post(':id/messages')
  sendMessage(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(sendConversationMessageSchema)) input: SendConversationMessageDto) { return this.inboxService.sendMessage(request, conversationId, input); }
  @Post(':id/notes')
  addNote(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(createConversationNoteSchema)) input: CreateConversationNoteDto) { return this.inboxService.addNote(request, conversationId, input); }
  @Post(':id/tags')
  addTag(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(createConversationTagSchema)) input: CreateConversationTagDto) { return this.inboxService.addTag(request, conversationId, input); }
  @Delete(':id/tags/:tagId')
  removeTag(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Param('tagId', new ZodValidationPipe(conversationIdSchema)) tagId: string) { return this.inboxService.removeTag(request, conversationId, tagId); }
}
