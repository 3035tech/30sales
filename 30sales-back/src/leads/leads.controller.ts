import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignLeadSchema, createLeadContactSchema, createLeadSchema, createQualificationFactSchema, leadDuplicateCheckSchema, listAccountContactsSchema, linkAccountContactSchema, listLeadsSchema, listQualificationFactsSchema, listSdrPreviewSchema, reviewContactOutreachSchema, updateLeadContactSchema, updateLeadStatusSchema, createTaskSchema, listTasksSchema, completeTaskSchema } from './leads.dto';
import type { AssignLeadDto, CreateLeadContactDto, CreateLeadDto, CreateQualificationFactDto, LeadDuplicateCheckDto, ListAccountContactsQueryDto, LinkAccountContactDto, ListLeadsQueryDto, ListQualificationFactsQueryDto, ListSdrPreviewQueryDto, ReviewContactOutreachDto, UpdateLeadContactDto, UpdateLeadStatusDto, CreateTaskDto, ListTasksQueryDto, CompleteTaskDto } from './leads.dto';
import { LeadsService } from './leads.service';
import { z } from 'zod';

const leadIdSchema = z.string().uuid();
@Controller('api/v1/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}
  @Get('table')
  listPage(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listLeadsSchema)) query: ListLeadsQueryDto) {
    return this.leadsService.listPage(request, query);
  }
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listLeadsSchema)) query: ListLeadsQueryDto) {
    return this.leadsService.list(request, query);
  }
  @Get('assignees')
  assignees(@ApiRequest() request: ApiRequestDto) {
    return this.leadsService.listAssignees(request);
  }
  @Get('sdr-preview/channels')
  sdrPreviewChannels(@ApiRequest() request: ApiRequestDto) {
    return this.leadsService.sdrPreviewChannels(request);
  }
  @Get('sdr-preview')
  sdrPreview(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listSdrPreviewSchema)) query: ListSdrPreviewQueryDto) {
    return this.leadsService.sdrPreview(request, query);
  }
  @Get(':id/sdr-readiness')
  sdrReadiness(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string) {
    return this.leadsService.sdrReadiness(request, leadId);
  }
  @Post('duplicate-check')
  checkDuplicates(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(leadDuplicateCheckSchema)) dto: LeadDuplicateCheckDto) {
    return this.leadsService.findPossibleDuplicates(request, dto);
  }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto) {
    return this.leadsService.create(request, dto);
  }
  @Get(':id/contacts')
  listContacts(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string) {
    return this.leadsService.listContacts(request, leadId);
  }
  @Get(':id/account-contacts')
  listAccountContacts(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Query(new ZodValidationPipe(listAccountContactsSchema)) query: ListAccountContactsQueryDto) {
    return this.leadsService.listAccountContacts(request, leadId, query);
  }
  @Post(':id/contacts/link')
  linkAccountContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(linkAccountContactSchema)) dto: LinkAccountContactDto) {
    return this.leadsService.linkAccountContact(request, leadId, dto);
  }
  @Get(':id/qualification-facts')
  listQualificationFacts(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Query(new ZodValidationPipe(listQualificationFactsSchema)) query: ListQualificationFactsQueryDto) {
    return this.leadsService.listQualificationFacts(request, leadId, query);
  }
  @Post(':id/qualification-facts')
  createQualificationFact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(createQualificationFactSchema)) dto: CreateQualificationFactDto) {
    return this.leadsService.createQualificationFact(request, leadId, dto);
  }
  @Post(':id/qualification-suggestions')
  suggestQualificationFacts(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string) {
    return this.leadsService.suggestQualificationFacts(request, leadId);
  }
  @Post(':id/contacts')
  createContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(createLeadContactSchema)) dto: CreateLeadContactDto) {
    return this.leadsService.createContact(request, leadId, dto);
  }
  @Patch(':id/contacts/:contactId')
  updateContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Param('contactId', new ZodValidationPipe(leadIdSchema)) contactId: string, @Body(new ZodValidationPipe(updateLeadContactSchema)) dto: UpdateLeadContactDto) {
    return this.leadsService.updateContact(request, leadId, contactId, dto);
  }
  @Patch(':id/contacts/:contactId/outreach-review')
  reviewContactOutreach(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Param('contactId', new ZodValidationPipe(leadIdSchema)) contactId: string, @Body(new ZodValidationPipe(reviewContactOutreachSchema)) dto: ReviewContactOutreachDto) {
    return this.leadsService.reviewContactOutreach(request, leadId, contactId, dto);
  }
  @Patch(':id/contacts/:contactId/primary')
  setPrimaryContact(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Param('contactId', new ZodValidationPipe(leadIdSchema)) contactId: string) {
    return this.leadsService.setPrimaryContact(request, leadId, contactId);
  }
  @Patch(':id/status')
  updateStatus(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(updateLeadStatusSchema)) dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(request, leadId, dto);
  }
  @Patch(':id/assignee')
  assign(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(assignLeadSchema)) dto: AssignLeadDto) {
    return this.leadsService.assign(request, leadId, dto);
  }
  @Get('tasks')
  listTasks(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listTasksSchema)) query: ListTasksQueryDto) {
    return this.leadsService.listTasks(request, query);
  }
  @Get('tasks/page')
  listTasksPage(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listTasksSchema)) query: ListTasksQueryDto) {
    return this.leadsService.listTasksPage(request, query);
  }
  @Post(':id/tasks')
  createTask(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(leadIdSchema)) leadId: string, @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto) {
    return this.leadsService.createTask(request, leadId, dto);
  }
  @Patch('tasks/:taskId/complete')
  completeTask(@ApiRequest() request: ApiRequestDto, @Param('taskId', new ZodValidationPipe(leadIdSchema)) taskId: string, @Body(new ZodValidationPipe(completeTaskSchema)) dto: CompleteTaskDto) {
    return this.leadsService.completeTask(request, taskId, dto);
  }
}
