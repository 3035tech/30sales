import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assignLeadSchema, createLeadSchema, leadDuplicateCheckSchema, listLeadsSchema, updateLeadStatusSchema, createTaskSchema, listTasksSchema, completeTaskSchema } from './leads.dto';
import type { AssignLeadDto, CreateLeadDto, LeadDuplicateCheckDto, ListLeadsQueryDto, UpdateLeadStatusDto, CreateTaskDto, ListTasksQueryDto, CompleteTaskDto } from './leads.dto';
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
  @Post('duplicate-check')
  checkDuplicates(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(leadDuplicateCheckSchema)) dto: LeadDuplicateCheckDto) {
    return this.leadsService.findPossibleDuplicates(request, dto);
  }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto) {
    return this.leadsService.create(request, dto);
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
