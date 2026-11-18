import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';
import { interpretationFailureSignalSchema, type InterpretationFailureSignalInputDto } from './webhooks.dto';

@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('whatsapp-cloud')
  verifyCloud(@Query('hub.mode') mode: string | undefined, @Query('hub.verify_token') token: string | undefined, @Query('hub.challenge') challenge: string | undefined): string {
    return this.webhooksService.verifyCloudChallenge(mode, token, challenge);
  }

  @Post('evolution/:channelId')
  ingestEvolution(@Param('channelId', new ZodValidationPipe(z.string().uuid())) channelId: string, @Headers('x-30sales-webhook-key') webhookSecret: string | undefined, @Body() payload: unknown, @Req() request: Request) {
    return this.webhooksService.ingestEvolution(channelId, webhookSecret, payload, request.rawBody ?? Buffer.alloc(0));
  }

  @Post('evolution/:channelId/:eventName')
  ingestEvolutionEventRoute(@Param('channelId', new ZodValidationPipe(z.string().uuid())) channelId: string, @Headers('x-30sales-webhook-key') webhookSecret: string | undefined, @Body() payload: unknown, @Req() request: Request) {
    return this.webhooksService.ingestEvolution(channelId, webhookSecret, payload, request.rawBody ?? Buffer.alloc(0));
  }

  @Post(':channelId/agent-signals/interpretation-failure')
  ingestInterpretationFailure(
    @Param('channelId', new ZodValidationPipe(z.string().uuid())) channelId: string,
    @Headers('x-30sales-webhook-key') webhookSecret: string | undefined,
    @Body(new ZodValidationPipe(interpretationFailureSignalSchema)) payload: InterpretationFailureSignalInputDto,
    @Req() request: Request,
  ) {
    return this.webhooksService.ingestInterpretationFailure(channelId, webhookSecret, payload, request.rawBody ?? Buffer.alloc(0));
  }

  @Post('whatsapp-cloud')
  ingestCloud(@Headers('x-hub-signature-256') signature: string | undefined, @Body() payload: unknown, @Req() request: Request) {
    return this.webhooksService.ingestCloud(signature, payload, request.rawBody ?? Buffer.alloc(0));
  }
}
