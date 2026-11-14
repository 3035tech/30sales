import { Controller, Get, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditService } from './audit.service';
import { listAuditEventsSchema } from './audit.dto';
import type { ListAuditEventsQueryDto } from './audit.dto';

@Controller('api/v1/audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listAuditEventsSchema)) query: ListAuditEventsQueryDto) { return this.auditService.list(request, query); }
}
