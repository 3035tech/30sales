import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { channelScheduleExceptionSchema, configureChannelCredentialsSchema, channelMonitoringCheckSchema, channelWebhookEventsQuerySchema, createChannelSchema, updateChannelSchema } from './channels.dto';
import type { ChannelScheduleExceptionInputDto, ConfigureChannelCredentialsDto, ChannelMonitoringCheckInputDto, ChannelWebhookEventsQueryDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import { ChannelsService } from './channels.service';

const channelIdSchema = z.string().uuid();
const businessLineQuerySchema = z.string().uuid().optional();
@Controller('api/v1/channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query('businessLineId', new ZodValidationPipe(businessLineQuerySchema)) businessLineId?: string) { return this.channelsService.list(request, businessLineId); }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createChannelSchema)) input: CreateChannelDto) { return this.channelsService.create(request, input); }
  @Patch(':id')
  update(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Body(new ZodValidationPipe(updateChannelSchema)) input: UpdateChannelDto) { return this.channelsService.update(request, channelId, input); }
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.delete(request, channelId); }
  @Put(':id/schedule-exceptions')
  saveScheduleException(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Body(new ZodValidationPipe(channelScheduleExceptionSchema)) input: ChannelScheduleExceptionInputDto) { return this.channelsService.saveScheduleException(request, channelId, input); }
  @Delete(':id/schedule-exceptions/:exceptionId')
  @HttpCode(HttpStatus.OK)
  deleteScheduleException(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Param('exceptionId', new ZodValidationPipe(channelIdSchema)) exceptionId: string) { return this.channelsService.deleteScheduleException(request, channelId, exceptionId); }
  @Put(':id/credentials')
  configureCredentials(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Body(new ZodValidationPipe(configureChannelCredentialsSchema)) credentials: ConfigureChannelCredentialsDto) { return this.channelsService.configureCredentials(request, channelId, credentials); }
  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  healthCheck(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.healthCheck(request, channelId); }
  @Post('monitoring/check')
  @HttpCode(HttpStatus.OK)
  checkMonitoring(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(channelMonitoringCheckSchema)) input: ChannelMonitoringCheckInputDto) { return this.channelsService.checkMonitoring(request, input); }
  @Get(':id/evolution-instances')
  discoverEvolutionInstances(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.discoverEvolutionInstances(request, channelId); }
  @Post(':id/evolution-webhook/configure')
  @HttpCode(HttpStatus.OK)
  configureEvolutionWebhook(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.configureEvolutionWebhook(request, channelId); }
  @Post(':id/evolution/connect')
  @HttpCode(HttpStatus.OK)
  connectEvolution(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.connectEvolution(request, channelId); }
  @Get(':id/events')
  listWebhookEvents(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Query(new ZodValidationPipe(channelWebhookEventsQuerySchema)) query: ChannelWebhookEventsQueryDto) { return this.channelsService.listWebhookEvents(request, channelId, query); }
}
