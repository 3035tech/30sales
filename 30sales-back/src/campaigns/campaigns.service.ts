import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ORGANIZATION_CLOSER_ROLES, ORGANIZATION_MANAGEMENT_ROLES, hasOrganizationRole } from '../auth/authorization.constants';
import { LeadRepositoryAccessDto } from '../leads/leads.dto';
import { CampaignAudiencePreviewDto, CampaignAudiencePreviewQueryDto, CampaignAudiencePreviewRepositoryDto, CampaignAudienceSaveDto, CampaignAudienceSaveRepositoryDto, CampaignDraftCreateRepositoryDto, CampaignDraftDto, CampaignDraftListRepositoryDto, CampaignDraftPageDto, CampaignNoSendDateDeleteRepositoryDto, CampaignNoSendDateDto, CampaignNoSendDateMutationRepositoryDto, CreateCampaignNoSendDateDto, CreateCampaignDraftDto, ListCampaignDraftsDto, SaveCampaignAudienceDto } from './campaigns.dto';
import { CampaignsRepository } from './campaigns.repository';
import { CAMPAIGN_ERROR_CODE, CAMPAIGN_NO_SEND_DATE_ERROR } from './campaigns.constants';
import { ChannelsService } from '../channels/channels.service';
import { CHANNEL_HEALTH_STATUS } from '../channels/channels.dto';
import { CampaignOperationalReadinessDto, CampaignOperationalSnapshotRepositoryDto } from './campaigns.dto';
import { CampaignStartRepositoryDto } from './campaigns.dto';

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
    const localDateParts = new Intl.DateTimeFormat('en-CA', { timeZone: snapshot.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(checkedAt);
    const localDate = `${localDateParts.find((part) => part.type === 'year')?.value}-${localDateParts.find((part) => part.type === 'month')?.value}-${localDateParts.find((part) => part.type === 'day')?.value}`;
    const holidayToday = snapshot.noSendDates.find((holiday) => holiday.date === localDate) ?? null;
    const windowOpen = snapshot.windowStart <= localTime && localTime < snapshot.windowEnd;
    const providerReady = snapshot.provider === 'evolution' ? health?.status === CHANNEL_HEALTH_STATUS.connected : health?.status === CHANNEL_HEALTH_STATUS.reachable;
    const channelRemaining = Math.max(0, snapshot.channelDailyMessageLimit - snapshot.channelDailyMessageCount);
    const canQueue = snapshot.channelActive && snapshot.channelConfigured && snapshot.agentReady && providerReady && windowOpen && holidayToday === null && snapshot.audienceCount > 0 && snapshot.audienceCount <= snapshot.campaignDailyMessageLimit && snapshot.audienceCount <= channelRemaining;
    return new CampaignOperationalReadinessDto(campaignDraftId, checkedAt.toISOString(), snapshot.audienceCount,
      { active: snapshot.channelActive, configured: snapshot.channelConfigured, health: health?.status ?? null },
      { openNow: windowOpen, startsAt: snapshot.windowStart, endsAt: snapshot.windowEnd, timeZone: snapshot.timeZone },
      { campaignLimit: snapshot.campaignDailyMessageLimit, channelLimit: snapshot.channelDailyMessageLimit, channelUsed: snapshot.channelDailyMessageCount, channelRemaining: Math.max(0, snapshot.channelDailyMessageLimit - snapshot.channelDailyMessageCount) },
      { configured: snapshot.noSendDates.length > 0, datesCount: snapshot.noSendDates.length, noSendToday: holidayToday !== null, todayName: holidayToday?.name ?? null }, false, canQueue);
  }

  async start(request: ApiRequestDto, campaignDraftId: string) {
    const context = await this.tenantAccess.require(request, 'update', 'integrations');
    const snapshot = await this.repository.operationalSnapshot(new CampaignOperationalSnapshotRepositoryDto(context.organizationId, campaignDraftId));
    if (!snapshot) throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.draftNotFound, message: 'The campaign draft was not found in the active organization.' });
    if (!snapshot.channelActive || !snapshot.channelConfigured) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.notReady, message: 'The campaign channel is inactive or missing credentials.' });
    const health = await this.channelsService.checkHealthForOrganization(context.organizationId, snapshot.channelId, context.userId, request.correlationId);
    const providerReady = snapshot.provider === 'evolution' ? health?.status === CHANNEL_HEALTH_STATUS.connected : health?.status === CHANNEL_HEALTH_STATUS.reachable;
    if (!providerReady) throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.notReady, message: 'The messaging provider is not connected and ready.' });
    const result = await this.repository.start(new CampaignStartRepositoryDto(context.organizationId, context.userId, campaignDraftId, request.correlationId));
    if (result === 'not_found') throw new NotFoundException({ code: CAMPAIGN_ERROR_CODE.draftNotFound, message: 'The campaign draft was not found in the active organization.' });
    if (result === 'already_started') throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.alreadyStarted, message: 'This campaign has already started.' });
    if (result === 'ineligible') throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.audienceIneligible, message: 'One or more selected leads are no longer eligible. Refresh the audience preview.' });
    if (result === 'quota_exceeded') throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.notReady, message: 'The channel or campaign daily quota does not have capacity for the selected audience.' });
    if (result === 'not_ready') throw new ConflictException({ code: CAMPAIGN_ERROR_CODE.notReady, message: 'The campaign is outside its sending window or falls on a no-send date.' });
    return result;
  }

  async listNoSendDates(request: ApiRequestDto): Promise<CampaignNoSendDateDto[]> {
    const context = await this.tenantAccess.require(request, 'read');
    return this.repository.listNoSendDates(context.organizationId);
  }
  async createNoSendDate(request: ApiRequestDto, input: CreateCampaignNoSendDateDto): Promise<CampaignNoSendDateDto> {
    const context = await this.tenantAccess.require(request, 'update');
    const result = await this.repository.createNoSendDate(new CampaignNoSendDateMutationRepositoryDto(context.organizationId, context.userId, request.correlationId, input));
    if (result === 'duplicate') throw new ConflictException({ code: CAMPAIGN_NO_SEND_DATE_ERROR.duplicate, message: 'A no-send date is already configured for this organization.' });
    if (result === 'limit_reached') throw new ConflictException({ code: CAMPAIGN_NO_SEND_DATE_ERROR.limit, message: 'The organization has reached its no-send date limit.' });
    return result;
  }
  async importNationalHolidays(request: ApiRequestDto): Promise<CampaignNoSendDateDto[]> {
    const context = await this.tenantAccess.require(request, 'update');
    const result = await this.repository.importNationalHolidays(context.organizationId, context.userId, request.correlationId);
    if (result === 'limit_reached') throw new ConflictException({ code: CAMPAIGN_NO_SEND_DATE_ERROR.limit, message: 'The organization has reached its no-send date limit.' });
    return result;
  }
  async deleteNoSendDate(request: ApiRequestDto, id: string): Promise<{ readonly deleted: true }> {
    const context = await this.tenantAccess.require(request, 'update');
    const deleted = await this.repository.deleteNoSendDate(new CampaignNoSendDateDeleteRepositoryDto(context.organizationId, context.userId, request.correlationId, id));
    if (!deleted) throw new NotFoundException({ code: CAMPAIGN_NO_SEND_DATE_ERROR.notFound, message: 'The no-send date was not found in the active organization.' });
    return { deleted: true };
  }
}
