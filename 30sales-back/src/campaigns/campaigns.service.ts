import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES, hasOrganizationRole } from '../auth/authorization.constants';
import { LeadRepositoryAccessDto } from '../leads/leads.dto';
import { CampaignAudiencePreviewDto, CampaignAudiencePreviewQueryDto, CampaignAudiencePreviewRepositoryDto, CampaignAudienceSaveDto, CampaignAudienceSaveRepositoryDto, CampaignDraftCreateRepositoryDto, CampaignDraftDto, CampaignDraftListRepositoryDto, CampaignDraftPageDto, CreateCampaignDraftDto, ListCampaignDraftsDto, SaveCampaignAudienceDto } from './campaigns.dto';
import { CampaignsRepository } from './campaigns.repository';
import { CAMPAIGN_ERROR_CODE } from './campaigns.constants';
import { ChannelsService } from '../channels/channels.service';
import { CHANNEL_HEALTH_STATUS } from '../channels/channels.dto';
import { CampaignOperationalReadinessDto, CampaignOperationalSnapshotRepositoryDto } from './campaigns.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: CampaignsRepository, private readonly channelsService: ChannelsService) {}
  private access(organizationId: string, userId: string, role: string): LeadRepositoryAccessDto {
    return new LeadRepositoryAccessDto(organizationId, userId, hasOrganizationRole(role, ORGANIZATION_MANAGEMENT_ROLES), hasOrganizationRole(role, ORGANIZATION_CLOSER_ROLES));
  }
  async list(request: ApiRequestDto, query: ListCampaignDraftsDto): Promise<CampaignDraftPageDto> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.list(new CampaignDraftListRepositoryDto(context.organizationId, query));
  }
  async create(request: ApiRequestDto, dto: CreateCampaignDraftDto): Promise<CampaignDraftDto> {
    const context = await this.tenantAccess.require(request, 'create');
    const draft = await this.repository.create(new CampaignDraftCreateRepositoryDto(context.organizationId, context.userId, request.correlationId, dto));
    if (!draft) throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.channelUnavailable, message: 'The selected channel is not active and configured in the active organization.' });
    return draft;
  }
  async previewAudience(request: ApiRequestDto, campaignDraftId: string, query: CampaignAudiencePreviewQueryDto): Promise<CampaignAudiencePreviewDto> {
    const context = await this.tenantAccess.require(request, 'read');
    const preview = await this.repository.getAudiencePreview(new CampaignAudiencePreviewRepositoryDto(context.organizationId, campaignDraftId, this.access(context.organizationId, context.userId, context.role), query));
    if (!preview) throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.draftNotFound, message: 'The campaign draft was not found in the active organization.' });
    return preview;
  }
  async saveAudience(request: ApiRequestDto, campaignDraftId: string, dto: SaveCampaignAudienceDto): Promise<CampaignAudienceSaveDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const result = await this.repository.saveAudience(new CampaignAudienceSaveRepositoryDto(context.organizationId, campaignDraftId, context.userId, request.correlationId, this.access(context.organizationId, context.userId, context.role), dto));
    if (!result) throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.draftNotFound, message: 'The campaign draft was not found in the active organization.' });
    return result;
  }
  async checkOperationalReadiness(request: ApiRequestDto, campaignDraftId: string): Promise<CampaignOperationalReadinessDto> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    const snapshot = await this.repository.operationalSnapshot(new CampaignOperationalSnapshotRepositoryDto(context.organizationId, campaignDraftId));
    if (!snapshot) throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.draftNotFound, message: 'The campaign draft was not found in the active organization.' });
    const checkedAt = new Date();
    const health = snapshot.channelActive && snapshot.channelConfigured
      ? await this.channelsService.checkHealthForOrganization(context.organizationId, snapshot.channelId, context.userId, request.correlationId)
      : null;
    const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: snapshot.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(checkedAt);
    return new CampaignOperationalReadinessDto(campaignDraftId, checkedAt.toISOString(), snapshot.audienceCount,
      { active: snapshot.channelActive, configured: snapshot.channelConfigured, health: health?.status ?? null },
      { openNow: snapshot.windowStart <= localTime && localTime < snapshot.windowEnd, startsAt: snapshot.windowStart, endsAt: snapshot.windowEnd, timeZone: snapshot.timeZone },
      false, false, false);
  }
}
