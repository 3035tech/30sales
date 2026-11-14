import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { requestContext, readCorrelationId } from './common/request-context';
import { toNodeHandler } from 'better-auth/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { env } from './config/env';
async function bootstrap() { const app = await NestFactory.create(AppModule, { bodyParser: false }); app.enableCors({ origin: env.FRONTEND_URL, credentials: true }); app.use((request: Request, _response: Response, next: NextFunction) => { requestContext.run({ correlationId: readCorrelationId(request.headers) }, next); }); app.use('/api/auth', toNodeHandler(auth)); app.use(express.json({ verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } })); await app.listen(env.PORT, '0.0.0.0'); }
void bootstrap();
