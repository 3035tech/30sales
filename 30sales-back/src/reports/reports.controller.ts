import { Controller, Get, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dailyActivityQuerySchema, funnelReportQuerySchema } from './reports.dto';
import type { DailyActivityQueryDto, FunnelReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}
  @Get('daily-activity')
  dailyActivity(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(dailyActivityQuerySchema)) query: DailyActivityQueryDto) {
    return this.reportsService.dailyActivity(request, query);
  }
  @Get('funnel')
  funnel(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(funnelReportQuerySchema)) query: FunnelReportQueryDto) {
    return this.reportsService.funnel(request, query);
  }
  @Get('ai-usage')
  aiUsage(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(funnelReportQuerySchema)) query: FunnelReportQueryDto) {
    return this.reportsService.aiUsage(request, query);
  }
}
