import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listNotificationsSchema, ListNotificationsQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}
  @Get()
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsQueryDto) { return this.notificationsService.list(request, query); }
  @Patch(':id/read')
  markRead(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) notificationId: string) { return this.notificationsService.markRead(request, notificationId); }
}
