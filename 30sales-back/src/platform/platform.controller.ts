import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { PLATFORM_API_PATH, PLATFORM_ORGANIZATION_API_PATH } from '../auth/authorization.constants';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { checkPlatformEvolutionConnectionSchema, createPlatformOrganizationInvitationSchema, createPlatformOrganizationSchema, listPlatformOrganizationsSchema, platformAiUsageQuerySchema, platformAuditQuerySchema, platformOrganizationIdSchema, platformOrganizationInvitationIdSchema, savePlatformEvolutionConfigurationSchema, type CheckPlatformEvolutionConnectionDto, type CreatePlatformOrganizationDto, type CreatePlatformOrganizationInvitationDto, type ListPlatformOrganizationsQueryDto, type PlatformAiUsageQueryDto, type PlatformAuditQueryDto, type SavePlatformEvolutionConfigurationDto } from './platform.dto';
import { PlatformService } from './platform.service';

@Controller(PLATFORM_ORGANIZATION_API_PATH)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}
  @Get()
  listOrganizations(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listPlatformOrganizationsSchema)) query: ListPlatformOrganizationsQueryDto) {
    return this.platformService.listOrganizations(request, query);
  }
  @Post()
  createOrganization(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(createPlatformOrganizationSchema)) input: CreatePlatformOrganizationDto) {
    return this.platformService.createOrganization(request, input);
  }
  @Post(':organizationId/access')
  accessOrganization(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string) {
    return this.platformService.accessOrganization(request, organizationId);
  }
  @Get(':organizationId/members')
  listOrganizationMembers(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string) {
    return this.platformService.listOrganizationMembers(request, organizationId);
  }
  @Delete(':organizationId/members/:memberId')
  removeOrganizationMember(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string, @Param('memberId', new ZodValidationPipe(platformOrganizationIdSchema)) memberId: string) {
    return this.platformService.removeOrganizationMember(request, organizationId, memberId);
  }
  @Post(':organizationId/invitations')
  inviteOrganizationMember(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string, @Body(new ZodValidationPipe(createPlatformOrganizationInvitationSchema)) input: CreatePlatformOrganizationInvitationDto) {
    return this.platformService.inviteOrganizationMember(request, organizationId, input);
  }
  @Post(':organizationId/invitations/:invitationId/resend')
  resendOrganizationInvitation(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string, @Param('invitationId', new ZodValidationPipe(platformOrganizationInvitationIdSchema)) invitationId: string) {
    return this.platformService.resendOrganizationInvitation(request, organizationId, invitationId);
  }
  @Delete(':organizationId/invitations/:invitationId')
  cancelOrganizationInvitation(@ApiRequest() request: ApiRequestDto, @Param('organizationId', new ZodValidationPipe(platformOrganizationIdSchema)) organizationId: string, @Param('invitationId', new ZodValidationPipe(platformOrganizationInvitationIdSchema)) invitationId: string) {
    return this.platformService.cancelOrganizationInvitation(request, organizationId, invitationId);
  }
  @Get('integrations/evolution')
  getEvolutionConfiguration(@ApiRequest() request: ApiRequestDto) { return this.platformService.getEvolutionConfiguration(request); }
  @Get('integrations/evolution/audit')
  listEvolutionAudit(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(platformAuditQuerySchema)) query: PlatformAuditQueryDto) { return this.platformService.listEvolutionAudit(request, query); }
  @Put('integrations/evolution')
  saveEvolutionConfiguration(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(savePlatformEvolutionConfigurationSchema)) input: SavePlatformEvolutionConfigurationDto) { return this.platformService.saveEvolutionConfiguration(request, input); }
  @Post('integrations/evolution/check')
  @HttpCode(HttpStatus.OK)
  checkEvolutionConfiguration(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(checkPlatformEvolutionConnectionSchema)) input: CheckPlatformEvolutionConnectionDto) { return this.platformService.checkEvolutionConfiguration(request, input); }
}

@Controller(PLATFORM_API_PATH)
export class PlatformAiUsageController {
  constructor(private readonly platformService: PlatformService) {}
  @Get('ai-usage')
  aiUsage(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(platformAiUsageQuerySchema)) query: PlatformAiUsageQueryDto) {
    return this.platformService.aiUsage(request, query);
  }
}
