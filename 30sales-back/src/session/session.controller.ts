import { Controller, Get } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { SessionService } from './session.service';
@Controller('api/v1')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}
  @Get('session')
  getCurrent(@ApiRequest() request: ApiRequestDto) {
    return this.sessionService.getCurrent(request);
  }
}
