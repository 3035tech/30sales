import { Body, Controller, Post } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { checkExternalIdentitiesSchema } from './imports.dto';
import type { CheckExternalIdentitiesInputDto } from './imports.dto';
import { ImportsService } from './imports.service';

@Controller('api/v1/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}
  @Post('identity-check')
  checkExternalIdentities(@ApiRequest() request: ApiRequestDto, @Body(new ZodValidationPipe(checkExternalIdentitiesSchema)) input: CheckExternalIdentitiesInputDto) {
    return this.importsService.checkExternalIdentities(request, input);
  }
}
