import { Controller, Get, Param, Post, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttachmentsService } from './attachments.service';

@Controller('api/v1/attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post(':id/retry')
  retry(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string) {
    return this.service.retry(request, id);
  }

  @Get(':id/content')
  async download(@ApiRequest() request: ApiRequestDto, @Param('id', new ZodValidationPipe(z.string().uuid())) id: string): Promise<StreamableFile> {
    const attachment = await this.service.download(request, id);
    const safeName = (attachment.fileName ?? 'attachment').replace(/[\\/\r\n\"\u0000-\u001f]/g, '_').slice(0, 160) || 'attachment';
    const fallbackName = safeName.replace(/[^\x20-\x7e]/g, '_');
    return new StreamableFile(attachment.stream, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    });
  }
}
