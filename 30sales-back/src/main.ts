import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { requestContext, readCorrelationId } from './common/request-context';
import { toNodeHandler } from 'better-auth/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { env } from './config/env';
import { WebhooksService } from './webhooks/webhooks.service';
const JSON_BODY_SIZE_LIMIT = '256kb';
const WEBHOOK_JSON_BODY_SIZE_LIMIT = '4mb';
const EVOLUTION_WEBHOOK_JSON_BODY_SIZE_LIMIT = '140mb';
const captureRawBody = (request: Request, _response: Response, buffer: Buffer): void => { request.rawBody = buffer; };
const captureEvolutionBodyHash = (request: Request, _response: Response, buffer: Buffer): void => { request.evolutionRawBodyHash = createHash('sha256').update(buffer).digest('hex'); };
async function bootstrap() {
 const app = await NestFactory.create(AppModule, { bodyParser: false });
 app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
 app.use((request: Request, _response: Response, next: NextFunction) => { requestContext.run({ correlationId: readCorrelationId(request.headers) }, next); });
 app.use('/api/auth', toNodeHandler(auth));
 const webhooksService = app.get(WebhooksService);
 let evolutionRequestsInFlight = 0;
 app.use('/api/v1/webhooks/evolution', (request: Request, response: Response, next: NextFunction) => {
  if (request.method !== 'POST') return next();
  const match = /^\/api\/v1\/webhooks\/evolution\/([^/?]+)(?:\/|$)/.exec(request.originalUrl);
  let channelId: string;
  try { channelId = decodeURIComponent(match?.[1] ?? ''); } catch { response.sendStatus(404); return; }
  if (!match || !/^[0-9a-f-]{36}$/i.test(channelId)) { response.sendStatus(404); return; }
  if (evolutionRequestsInFlight >= env.EVOLUTION_WEBHOOK_MAX_CONCURRENCY) {
   response.setHeader('Retry-After', '2');
   response.status(503).json({ statusCode: 503, message: 'Webhook capacity is temporarily full.' });
   return;
  }
  evolutionRequestsInFlight += 1;
  let released = false;
  const release = () => { if (!released) { released = true; evolutionRequestsInFlight -= 1; } };
  response.once('finish', release);
  response.once('close', release);
  void webhooksService.authenticateEvolutionWebhook(channelId, request.header('x-30sales-webhook-key')).then(() => next()).catch((error: unknown) => {
   const status = error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 401 ? 401 : 503;
   response.sendStatus(status);
  });
 });
 app.use('/api/v1/webhooks/evolution', express.json({ limit: EVOLUTION_WEBHOOK_JSON_BODY_SIZE_LIMIT, verify: captureEvolutionBodyHash }));
 app.use('/api/v1/webhooks', express.json({ limit: WEBHOOK_JSON_BODY_SIZE_LIMIT, verify: captureRawBody }));
 app.use(express.json({ limit: JSON_BODY_SIZE_LIMIT, verify: captureRawBody }));
 await app.listen(env.PORT, '0.0.0.0');
}
void bootstrap();
