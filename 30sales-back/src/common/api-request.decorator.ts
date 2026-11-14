import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiRequestDto } from './api-request.dto';
export const ApiRequest = createParamDecorator((_data: unknown, context: ExecutionContext): ApiRequestDto => {
  const request = context.switchToHttp().getRequest<Request>();
  return new ApiRequestDto(request.headers);
});
