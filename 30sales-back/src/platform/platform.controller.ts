import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { PLATFORM_ORGANIZATION_API_PATH } from '../auth/authorization.constants';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { checkPlatformEvolutionConnectionSchema, createPlatformOrganizationSchema, listPlatformOrganizationsSchema, platformAuditQuerySchema, platformOrganizationIdSchema, savePlatformEvolutionConfigurationSchema, type CheckPlatformEvolutionConnectionDto, type CreatePlatformOrganizationDto, type ListPlatformOrganizationsQueryDto, type PlatformAuditQueryDto, type SavePlatformEvolutionConfigurationDto } from './platform.dto';
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
