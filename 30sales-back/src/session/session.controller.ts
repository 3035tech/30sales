import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionService } from './session.service';
import { invitationPreviewIdSchema, invitationPreviewOrganizationIdSchema } from './session.dto';
@Controller('api/v1')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}
  @Get('session')
  getCurrent(@ApiRequest() request: ApiRequestDto) {
    return this.sessionService.getCurrent(request);
  }

  @Get('invitations/:invitationId/preview')
  @Header('Cache-Control', 'no-store')
  getInvitationPreview(@Param('invitationId', new ZodValidationPipe(invitationPreviewIdSchema)) invitationId: string, @Query('organizationId', new ZodValidationPipe(invitationPreviewOrganizationIdSchema)) organizationId?: string) {
    return this.sessionService.getInvitationPreview(invitationId, organizationId);
  }
}
