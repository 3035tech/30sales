import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PLATFORM_ORGANIZATION_API_PATH } from '../auth/authorization.constants';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPlatformOrganizationSchema, listPlatformOrganizationsSchema, type CreatePlatformOrganizationDto, type ListPlatformOrganizationsQueryDto } from './platform.dto';
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
}
