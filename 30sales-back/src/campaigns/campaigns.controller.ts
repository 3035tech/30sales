import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import { campaignAudiencePreviewQuerySchema, createCampaignDraftSchema, listCampaignDraftsSchema, saveCampaignAudienceSchema, type CampaignAudiencePreviewQueryDto, type CreateCampaignDraftDto, type ListCampaignDraftsDto, type SaveCampaignAudienceDto } from './campaigns.dto';
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
  @Get(':id/operational-readiness')
  checkOperationalReadiness(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(campaignDraftIdSchema)) campaignDraftId: string) { return this.campaignsService.checkOperationalReadiness(request, campaignDraftId); }
}
