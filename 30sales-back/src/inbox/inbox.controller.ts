import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Sse, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignConversationSchema, setConversationAutomationModeSchema, conversationStatusUpdateSchema, conversationTypingPresenceSchema, createConversationNoteSchema, createConversationTagSchema, listConversationsSchema, markConversationReadSchema, reconcileConversationContactSchema, sendConversationContactSchema, sendConversationMessageSchema, sendConversationMediaSchema, createConversationOpportunitySchema, updateConversationContactDetailsSchema } from './inbox.dto';
import type { AssignConversationDto, ConversationStatusUpdateInputDto, CreateConversationNoteDto, CreateConversationTagDto, ListConversationsQueryDto, MarkConversationReadInputDto, ReconcileConversationContactInputDto, SendConversationContactDto, SendConversationMessageDto, SendConversationMediaDto, CreateConversationOpportunityInputDto, SetConversationAutomationModeInputDto, ConversationTypingPresenceInputDto, UpdateConversationContactDetailsInputDto } from './inbox.dto';
import { InboxService } from './inbox.service';
import { OUTBOUND_MEDIA_LIMIT_BYTES } from './outbound-media.constants';
import type { IncomingMediaFile } from './outbound-media';
import { PLATFORM_ORGANIZATION_CONTEXT_HEADER } from '../auth/authorization.constants';

const conversationIdSchema = z.string().uuid();
const listMessagesSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0), search: z.string().trim().max(200).optional().default('') }).strict();
type ListMessagesQueryDto = z.infer<typeof listMessagesSchema>;
@Controller('api/v1/conversations')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listConversationsSchema)) query: ListConversationsQueryDto) { return this.inboxService.list(request, query); }
  @Sse('events') events(@ApiRequest() request: ApiRequestDto, @Query('platformOrganizationId', new ZodValidationPipe(z.string().uuid().optional())) platformOrganizationId?: string): Promise<Observable<MessageEvent>> {
    const scopedRequest = platformOrganizationId ? new ApiRequestDto({ ...request.headers, [PLATFORM_ORGANIZATION_CONTEXT_HEADER]: platformOrganizationId }) : request;
    return this.inboxService.events(scopedRequest);
  }
  @Get('channels')
  channels(@ApiRequest() request: ApiRequestDto) { return this.inboxService.channels(request); }
  @Get('assignees')
  assignees(@ApiRequest() request: ApiRequestDto) { return this.inboxService.assignees(request); }
  @Get('tags')
  tags(@ApiRequest() request: ApiRequestDto) { return this.inboxService.tags(request); }
  @Get('link-preview')
  getLinkPreview(@ApiRequest() request: ApiRequestDto, @Query('url') rawUrl: string) { return this.inboxService.getLinkPreview(request, rawUrl ?? ''); }
  @Get(':id/messages')
  messages(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Query(new ZodValidationPipe(listMessagesSchema)) query: ListMessagesQueryDto) { return this.inboxService.messages(request, conversationId, query); }
  @Get(':id/group-participants')
  groupParticipants(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string) { return this.inboxService.groupParticipants(request, conversationId); }
  @Post(':id/read')
  markRead(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(markConversationReadSchema)) input: MarkConversationReadInputDto) { return this.inboxService.markRead(request, conversationId, input); }
  @Post(':id/claim')
  claim(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string) { return this.inboxService.claim(request, conversationId); }
  @Post(':id/release')
  release(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string) { return this.inboxService.release(request, conversationId); }
  @Patch(':id/owner')
  assign(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(assignConversationSchema)) input: AssignConversationDto) { return this.inboxService.assign(request, conversationId, input); }
  @Patch(':id/contact-details')
  updateContactDetails(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(updateConversationContactDetailsSchema)) input: UpdateConversationContactDetailsInputDto) { return this.inboxService.updateContactDetails(request, conversationId, input); }
  @Post(':id/automation')
  setAutomation(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(setConversationAutomationModeSchema)) input: SetConversationAutomationModeInputDto) { return this.inboxService.setAutomationMode(request, conversationId, input.mode); }
  @Patch(':id/status')
  setStatus(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(conversationStatusUpdateSchema)) input: ConversationStatusUpdateInputDto) { return this.inboxService.setStatus(request, conversationId, input); }
  @Patch(':id/contact')
  reconcileContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(reconcileConversationContactSchema)) input: ReconcileConversationContactInputDto) { return this.inboxService.reconcileContact(request, conversationId, input); }
  @Post(':id/opportunity')
  createOpportunity(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(createConversationOpportunitySchema)) input: CreateConversationOpportunityInputDto) { return this.inboxService.createOpportunityFromConversation(request, conversationId, input); }
  @Post(':id/messages')
  sendMessage(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(sendConversationMessageSchema)) input: SendConversationMessageDto) { return this.inboxService.sendMessage(request, conversationId, input); }
  @Post(':id/presence')
  setTypingPresence(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(conversationTypingPresenceSchema)) input: ConversationTypingPresenceInputDto) { return this.inboxService.setTypingPresence(request, conversationId, input); }
  @Delete(':id/messages/:messageId')
  hideMessage(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Param('messageId', new ZodValidationPipe(conversationIdSchema)) messageId: string) { return this.inboxService.hideMessage(request, conversationId, messageId); }
  @Post(':id/messages/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: OUTBOUND_MEDIA_LIMIT_BYTES, files: 1, fields: 2, parts: 3 } }))
  sendMedia(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(sendConversationMediaSchema)) input: SendConversationMediaDto, @UploadedFile() file: IncomingMediaFile | undefined) { return this.inboxService.sendMediaMessage(request, conversationId, input, file); }
  @Post(':id/messages/contact')
  sendContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(sendConversationContactSchema)) input: SendConversationContactDto) { return this.inboxService.sendContactMessage(request, conversationId, input); }
  @Post(':id/notes')
  addNote(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(createConversationNoteSchema)) input: CreateConversationNoteDto) { return this.inboxService.addNote(request, conversationId, input); }
  @Post(':id/tags')
  addTag(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Body(new ZodValidationPipe(createConversationTagSchema)) input: CreateConversationTagDto) { return this.inboxService.addTag(request, conversationId, input); }
  @Delete(':id/tags/:tagId')
  removeTag(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string, @Param('tagId', new ZodValidationPipe(conversationIdSchema)) tagId: string) { return this.inboxService.removeTag(request, conversationId, tagId); }
}
