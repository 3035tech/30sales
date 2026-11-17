import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { channelCredentialsSchema, channelWebhookEventsQuerySchema, createChannelSchema, updateChannelSchema } from './channels.dto';
import type { ChannelCredentialsDto, ChannelWebhookEventsQueryDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import { ChannelsService } from './channels.service';

const channelIdSchema = z.string().uuid();
@Controller('api/v1/channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto) { return this.channelsService.list(request); }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createChannelSchema)) input: CreateChannelDto) { return this.channelsService.create(request, input); }
  @Patch(':id')
  update(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Body(new ZodValidationPipe(updateChannelSchema)) input: UpdateChannelDto) { return this.channelsService.update(request, channelId, input); }
  @Put(':id/credentials')
  configureCredentials(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string, @Body(new ZodValidationPipe(channelCredentialsSchema)) credentials: ChannelCredentialsDto) { return this.channelsService.configureCredentials(request, channelId, credentials); }
  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  healthCheck(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(channelIdSchema)) channelId: string) { return this.channelsService.healthCheck(request, channelId); }
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
