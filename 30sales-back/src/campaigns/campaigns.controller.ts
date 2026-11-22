import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import { campaignAudiencePreviewQuerySchema, createCampaignDraftSchema, createCampaignNoSendDateSchema, listCampaignDraftsSchema, saveCampaignAudienceSchema, type CampaignAudiencePreviewQueryDto, type CreateCampaignDraftDto, type CreateCampaignNoSendDateDto, type ListCampaignDraftsDto, type SaveCampaignAudienceDto } from './campaigns.dto';
import { z } from 'zod';

const campaignDraftIdSchema = z.string().uuid();

@Controller('api/v1/campaign-drafts')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listCampaignDraftsSchema)) query: ListCampaignDraftsDto) { return this.campaignsService.list(request, query); }
  @Post()
  create(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createCampaignDraftSchema)) dto: CreateCampaignDraftDto) { return this.campaignsService.create(request, dto); }
  @Get(':id/audience/preview')
  previewAudience(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string, @Query(new ZodValidationPipe(campaignAudiencePreviewQuerySchema)) query: CampaignAudiencePreviewQueryDto) { return this.campaignsService.previewAudience(request, campaignDraftId, query); }
  @Put(':id/audience')
  saveAudience(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string, @Body(new ZodValidationPipe(saveCampaignAudienceSchema)) dto: SaveCampaignAudienceDto) { return this.campaignsService.saveAudience(request, campaignDraftId, dto); }
  @Get('holiday-calendar')
  listNoSendDates(@ApiRequest() request: ApiRequestDto) { return this.campaignsService.listNoSendDates(request); }
  @Post('holiday-calendar')
  createNoSendDate(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createCampaignNoSendDateSchema)) dto: CreateCampaignNoSendDateDto) { return this.campaignsService.createNoSendDate(request, dto); }
  @Post('holiday-calendar/import-national')
  importNationalHolidays(@ApiRequest() request: ApiRequestDto) { return this.campaignsService.importNationalHolidays(request); }
  @Delete('holiday-calendar/:id')
  deleteNoSendDate(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) id: string) { return this.campaignsService.deleteNoSendDate(request, id); }
  @Get(':id/operational-readiness')
  checkOperationalReadiness(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.checkOperationalReadiness(request, campaignDraftId); }
  @Get(':id/performance')
  performance(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.performance(request, campaignDraftId); }
  @Get(':id/performance/leads')
  performanceLeads(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string, @Query(new ZodValidationPipe(listCampaignDraftsSchema)) query: ListCampaignDraftsDto) { return this.campaignsService.performanceLeads(request, campaignDraftId, query); }
  @Post(':id/start')
  start(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.start(request, campaignDraftId); }
  @Post(':id/pause')
  pause(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.pause(request, campaignDraftId); }
  @Post(':id/resume')
  resume(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.resume(request, campaignDraftId); }
  @Get('delivery-review')
  deliveryReview(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listCampaignDraftsSchema)) query: ListCampaignDraftsDto) { return this.campaignsService.deliveryReview(request, query); }
  @Post('delivery-review/:id/confirm-sent')
  confirmDelivery(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) outboxEventId: string) { return this.campaignsService.confirmDelivery(request, outboxEventId); }
  @Post('delivery-review/:id/confirm-not-sent')
  retryDelivery(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) outboxEventId: string) { return this.campaignsService.retryDelivery(request, outboxEventId); }
}
