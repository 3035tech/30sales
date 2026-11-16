import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { redisStorage } from '@better-auth/redis-storage';
import { env } from '../config/env';

const authLogger = new Logger('AuthRedis');

export const authRedisClient = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectionName: '30sales-auth-sessions',
    })
  : null;

authRedisClient?.on('error', () => authLogger.error('Redis session storage connection failed'));

export const authSecondaryStorage = authRedisClient
  ? redisStorage({ client: authRedisClient, keyPrefix: '30sales:better-auth:' })
  : null;

@Injectable()
export class AuthRedisService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    if (!authRedisClient) return;

    try {
      await authRedisClient.connect();
    } catch {
      authRedisClient.disconnect();
      throw new Error('Redis session storage connection failed.');
    }
  }

  onModuleDestroy(): void {
    authRedisClient?.disconnect();
  }
}
