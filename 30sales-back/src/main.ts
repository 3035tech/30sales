import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { requestContext, readCorrelationId } from './common/request-context';
import { toNodeHandler } from 'better-auth/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { env } from './config/env';
const JSON_BODY_SIZE_LIMIT = '256kb';
const WEBHOOK_JSON_BODY_SIZE_LIMIT = '4mb';
const EVOLUTION_WEBHOOK_JSON_BODY_SIZE_LIMIT = '140mb';
const captureRawBody = (request: Request, _response: Response, buffer: Buffer): void => { request.rawBody = buffer; };
async function bootstrap() { const app = await NestFactory.create(AppModule, { bodyParser: false }); app.enableCors({ origin: env.FRONTEND_URL, credentials: true }); app.use((request: Request, _response: Response, next: NextFunction) => { requestContext.run({ correlationId: readCorrelationId(request.headers) }, next); }); app.use('/api/auth', toNodeHandler(auth)); app.use('/api/v1/webhooks/evolution', express.json({ limit: EVOLUTION_WEBHOOK_JSON_BODY_SIZE_LIMIT, verify: captureRawBody })); app.use('/api/v1/webhooks', express.json({ limit: WEBHOOK_JSON_BODY_SIZE_LIMIT, verify: captureRawBody })); app.use(express.json({ limit: JSON_BODY_SIZE_LIMIT, verify: captureRawBody })); await app.listen(env.PORT, '0.0.0.0'); }
void bootstrap();
